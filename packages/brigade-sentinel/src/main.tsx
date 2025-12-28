import { Devvit } from '@devvit/public-api';
import {
  SourceClassification,
  checkRateLimit,
  consumeRateLimit,
  getJson,
  setJson,
  REDIS_PREFIX,
  findCrosslinks,
  getDeletedComments,
  geminiCrosslinkSearch,
  classifyPostTone,
  recordHater,
  enrichTopHatersWithOSINT,
  registerUserAlt,
  registerSubredditAlt,
} from '@hub-bot/common';
import { getBrigadeComment, getModmailBody } from './templates.js';

Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true, // For PullPush and Gemini API calls
});

// App settings
Devvit.addSettings([
  {
    name: 'enabled',
    type: 'boolean',
    label: 'Enable brigade detection',
    defaultValue: true,
  },
  {
    name: 'publicComment',
    type: 'boolean',
    label: 'Post public comment when crosslinks detected',
    defaultValue: true,
  },
  {
    name: 'modmailNotify',
    type: 'boolean',
    label: 'Send modmail for adversarial/hateful sources',
    defaultValue: false,
  },
  {
    name: 'stickyComment',
    type: 'boolean',
    label: 'Sticky the bot comment (requires mod permissions)',
    defaultValue: true,
  },
  {
    name: 'minimumLinkAge',
    type: 'number',
    label: 'Wait time before notifying (minutes)',
    defaultValue: 5,
  },
  // AI settings (BYOK) - used for tone classification of linking posts
  {
    name: 'aiProvider',
    type: 'select',
    label: 'AI provider for tone classification',
    options: [
      { label: 'None (all links treated as neutral)', value: 'none' },
      { label: 'Gemini (BYOK)', value: 'gemini' },
    ],
    defaultValue: ['none'],
  },
  {
    name: 'geminiApiKey',
    type: 'string',
    label: 'Your Gemini API key (get free at ai.google.dev)',
    isSecret: true,
    defaultValue: '',
  },
  // PullPush settings
  {
    name: 'includeDeletedContent',
    type: 'boolean',
    label: 'Check for deleted brigade comments via PullPush',
    defaultValue: true,
  },
  {
    name: 'deletedContentThreshold',
    type: 'number',
    label: 'Minimum deleted comments to mention in notification',
    defaultValue: 3,
  },
]);

interface BrigadeEvent {
  id: string;
  targetPostId: string;
  sourceSubreddit: string;
  sourcePostUrl: string;
  sourcePostTitle: string;
  detectedAt: number;
  notifiedAt: number | null;
  classification: SourceClassification;
}

// Scheduled job to scan for crosslinks
Devvit.addSchedulerJob({
  name: 'scanForCrosslinks',
  onRun: async (_event, context) => {
    const settings = await context.settings.getAll();
    if (!settings.enabled) return;

    const subreddit = await context.reddit.getCurrentSubreddit();
    const subredditName = subreddit.name;

    // Check rate limit
    const rateCheck = await checkRateLimit(context.redis, 'subPullpush', subreddit.id);
    if (!rateCheck.allowed) return;

    // Get last scan time
    const lastScanKey = `${REDIS_PREFIX.brigade}lastScan:${subredditName}`;
    const lastScan = await context.redis.get(lastScanKey);
    const lastScanTime = lastScan ? parseInt(lastScan, 10) : Date.now() - 24 * 60 * 60 * 1000;

    try {
      // Try PullPush first, fall back to Gemini if configured
      let posts = await findCrosslinks(subredditName, {
        limit: 50,
        after: Math.floor(lastScanTime / 1000),
      });

      // If PullPush returns empty and Gemini is configured, use as fallback
      if (posts.length === 0 && settings.geminiApiKey) {
        console.log(`PullPush empty for r/${subredditName}, trying Gemini fallback`);
        const geminiResults = await geminiCrosslinkSearch(
          subredditName,
          settings.geminiApiKey as string
        );
        posts = geminiResults.map(r => ({
          id: `gem_${Date.now()}_${r.subreddit}`,
          subreddit: r.subreddit,
          title: r.title,
          url: r.url,
          permalink: r.url,
          created_utc: Math.floor(Date.now() / 1000),
          author: 'unknown',
        }));
      }

      console.log(`Crosslink scan for r/${subredditName}: found ${posts.length} links`);

      for (const post of posts) {
        // Skip if same subreddit
        if (post.subreddit.toLowerCase() === subredditName.toLowerCase()) continue;

        // Skip if already processed
        const processedKey = `${REDIS_PREFIX.brigade}processed:${post.id}`;
        if (await context.redis.get(processedKey)) continue;

        // Extract target post ID from URL
        const targetPostId = extractTargetPostId(post.url, subredditName);
        if (!targetPostId) continue;

        // Classify the TONE of this specific linking post (not just the subreddit)
        const toneClassification = await classifyPostTone(
          post.title,
          settings.geminiApiKey as string
        );

        // Store event
        const brigadeEvent: BrigadeEvent = {
          id: `${post.id}-${targetPostId}`,
          targetPostId,
          sourceSubreddit: post.subreddit,
          sourcePostUrl: post.permalink,
          sourcePostTitle: post.title,
          detectedAt: Date.now(),
          notifiedAt: null,
          classification: toneClassification,
        };

        await setJson(
          context.redis,
          `${REDIS_PREFIX.brigade}event:${brigadeEvent.id}`,
          brigadeEvent,
          7 * 24 * 60 * 60 // 7 days TTL
        );

        // Record to hater leaderboard if hostile
        await recordHater(
          context,
          post.subreddit,
          post.author,
          toneClassification,
          post.title
        );

        // Queue notification (with delay per settings)
        const delayMinutes = (settings.minimumLinkAge as number) || 5;
        await context.scheduler.runJob({
          name: 'notifyBrigade',
          data: { eventId: brigadeEvent.id },
          runAt: new Date(Date.now() + delayMinutes * 60 * 1000),
        });

        // Mark as processed
        await context.redis.set(processedKey, 'queued', {
          expiration: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
      }

      await consumeRateLimit(context.redis, 'subPullpush', subreddit.id);
      await context.redis.set(lastScanKey, String(Date.now()));
    } catch (error) {
      console.error('Crosslink scan failed:', error);
    }
  },
});

// Job to post notification
Devvit.addSchedulerJob({
  name: 'notifyBrigade',
  onRun: async (event, context) => {
    const { eventId } = event.data as { eventId: string };

    const brigadeEvent = await getJson<BrigadeEvent>(
      context.redis,
      `${REDIS_PREFIX.brigade}event:${eventId}`
    );

    if (!brigadeEvent || brigadeEvent.notifiedAt) return;

    const settings = await context.settings.getAll();
    if (!settings.enabled) return;

    const subreddit = await context.reddit.getCurrentSubreddit();

    // Check rate limit for comments
    const rateCheck = await checkRateLimit(context.redis, 'subComment', subreddit.id);
    if (!rateCheck.allowed) return;

    try {
      // Get target post
      const targetPost = await context.reddit.getPostById(brigadeEvent.targetPostId);
      if (!targetPost) return;

      // Check for deleted comments if enabled
      let deletedCount = 0;
      if (settings.includeDeletedContent) {
        const deletedComments = await getDeletedComments(brigadeEvent.targetPostId, {
          after: Math.floor(brigadeEvent.detectedAt / 1000) - 3600, // 1 hour before detection
        });
        deletedCount = deletedComments.length;
      }

      // Post public comment if enabled
      if (settings.publicComment) {
        const commentBody = getBrigadeComment({
          sourceSubreddit: brigadeEvent.sourceSubreddit,
          sourceUrl: brigadeEvent.sourcePostUrl,
          sourceTitle: brigadeEvent.sourcePostTitle,
          classification: brigadeEvent.classification,
          subreddit: subreddit.name,
        });

        const comment = await context.reddit.submitComment({
          id: brigadeEvent.targetPostId,
          text: commentBody,
        });

        // Sticky if enabled and we have perms
        if (settings.stickyComment && comment) {
          try {
            await comment.distinguish(true);
          } catch {
            // No mod perms, skip sticky
          }
        }
      }

      // Send modmail for adversarial/hateful if enabled
      if (
        settings.modmailNotify &&
        (brigadeEvent.classification === SourceClassification.ADVERSARIAL ||
          brigadeEvent.classification === SourceClassification.HATEFUL)
      ) {
        const modmailBody = getModmailBody({
          sourceSubreddit: brigadeEvent.sourceSubreddit,
          sourceUrl: brigadeEvent.sourcePostUrl,
          sourceTitle: brigadeEvent.sourcePostTitle,
          classification: brigadeEvent.classification,
          subreddit: subreddit.name,
          postTitle: targetPost.title,
          postUrl: `https://reddit.com${targetPost.permalink}`,
          deletedCount: deletedCount >= (settings.deletedContentThreshold as number || 3) ? deletedCount : undefined,
        });

        await context.reddit.sendPrivateMessage({
          to: `/r/${subreddit.name}`,
          subject: `Brigade Alert: Link from r/${brigadeEvent.sourceSubreddit}`,
          text: modmailBody,
        });
      }

      // Update event
      brigadeEvent.notifiedAt = Date.now();
      await setJson(
        context.redis,
        `${REDIS_PREFIX.brigade}event:${eventId}`,
        brigadeEvent,
        7 * 24 * 60 * 60
      );

      await consumeRateLimit(context.redis, 'subComment', subreddit.id);
    } catch (error) {
      console.error('Brigade notification failed:', error);
    }
  },
});

// =============================================================================
// ALT ACCOUNT REPORTING VIA MENTION
// Users can report alts by mentioning the bot:
//   u/hub-bot-9000 alt u/mainaccount = u/altaccount
//   u/hub-bot-9000 alt r/mainsubreddit = r/altsubreddit
// =============================================================================

Devvit.addTrigger({
  event: 'CommentCreate',
  onEvent: async (event, context) => {
    const comment = event.comment;
    if (!comment?.body || !comment.id) return;

    const body = comment.body.toLowerCase();

    // Check if bot is mentioned
    const botMentioned = body.includes('u/hub-bot-9000') ||
                         body.includes('/u/hub-bot-9000') ||
                         body.includes('u/brigade-sentinel') ||
                         body.includes('/u/brigade-sentinel');

    if (!botMentioned) return;

    // Check for alt report pattern
    // Formats: "alt u/main = u/alt" or "alt r/main = r/alt"
    const altPattern = /alt\s+([ur])\/(\w+)\s*=\s*([ur])\/(\w+)/i;
    const match = comment.body.match(altPattern);

    if (!match) return;

    const [, type1, name1, type2, name2] = match;

    // Validate: both should be same type (both users or both subreddits)
    if (type1.toLowerCase() !== type2.toLowerCase()) {
      await context.reddit.submitComment({
        id: comment.id,
        text: `Sorry, can't link a user to a subreddit. Use:\n\n- \`alt u/main = u/alt\` for user alts\n- \`alt r/main = r/alt\` for subreddit alts`,
      });
      return;
    }

    const isUser = type1.toLowerCase() === 'u';
    const mainName = name1;
    const altName = name2;

    // Check rate limit (prevent spam)
    const author = comment.author || 'unknown';
    const rateCheck = await checkRateLimit(context.redis, 'altReport', author);
    if (!rateCheck.allowed) {
      return; // Silently ignore rate-limited requests
    }

    try {
      let result: { success: boolean; message: string };

      if (isUser) {
        result = await registerUserAlt(context, altName, mainName);
      } else {
        result = await registerSubredditAlt(context, altName, mainName);
      }

      // Reply with confirmation
      const prefix = isUser ? 'u' : 'r';
      const replyText = result.success
        ? `Thanks! Registered ${prefix}/${altName} as an alt of ${prefix}/${mainName}. Their scores will now be combined on the leaderboard.`
        : `Couldn't register alt: ${result.message}`;

      await context.reddit.submitComment({
        id: comment.id,
        text: replyText,
      });

      await consumeRateLimit(context.redis, 'altReport', author);
    } catch (error) {
      console.error('Alt registration failed:', error);
    }
  },
});

// =============================================================================
// OSINT ENRICHMENT JOB
// =============================================================================

// OSINT enrichment job - analyze deleted content of top haters
Devvit.addSchedulerJob({
  name: 'enrichHatersOSINT',
  onRun: async (_event, context) => {
    const settings = await context.settings.getAll();
    if (!settings.enabled || !settings.geminiApiKey) return;

    try {
      const result = await enrichTopHatersWithOSINT(
        context,
        settings.geminiApiKey as string,
        { topN: 5 }
      );
      console.log(`OSINT enrichment: ${result.enriched} enriched, ${result.errors} errors`);
    } catch (error) {
      console.error('OSINT enrichment failed:', error);
    }
  },
});

// Schedule scanner on install
Devvit.addTrigger({
  event: 'AppInstall',
  onEvent: async (_event, context) => {
    // Run crosslink scanner every 15 minutes
    await context.scheduler.runJob({
      name: 'scanForCrosslinks',
      cron: '*/15 * * * *',
    });

    // Run OSINT enrichment daily at 3am
    await context.scheduler.runJob({
      name: 'enrichHatersOSINT',
      cron: '0 3 * * *',
    });
  },
});

// Helper functions
function extractTargetPostId(url: string, targetSubreddit: string): string | null {
  // Match reddit.com/r/subreddit/comments/postid/...
  const regex = new RegExp(
    `reddit\\.com/r/${targetSubreddit}/comments/([a-z0-9]+)`,
    'i'
  );
  const match = url.match(regex);
  return match ? `t3_${match[1]}` : null;
}

export default Devvit;
