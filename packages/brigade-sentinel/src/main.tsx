import { Devvit, SettingScope } from '@devvit/public-api';
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
  // Pending alt report system (requires mod approval)
  submitPendingAltReport,
  approveAltReport,
  rejectAltReport,
  getAltReportById,
  formatAltReportModmail,
  emitBrigadeAlert,
  emitTrafficSpike,
  generateBotReply,
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
    scope: SettingScope.App,
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
  {
    name: 'enableBotReplies',
    type: 'boolean',
    label: 'Reply to users who respond to the bot',
    defaultValue: true,
  },
  // Traffic spike detection
  {
    name: 'detectTrafficSpikes',
    type: 'boolean',
    label: 'Detect unusual comment velocity spikes',
    defaultValue: true,
  },
  {
    name: 'velocityThreshold',
    type: 'number',
    label: 'Comments per 5 minutes to trigger spike alert',
    defaultValue: 10,
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

      // Post public comment if enabled (for crosslink alerts - this is the main feature)
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

      // Emit event to shared feed
      await emitBrigadeAlert(context, subreddit.name, {
        sourceSubreddit: brigadeEvent.sourceSubreddit,
        sourceUrl: brigadeEvent.sourcePostUrl,
        targetPostId: brigadeEvent.targetPostId,
        classification: brigadeEvent.classification,
      });
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
//
// IMPORTANT: Reports are handled SILENTLY via modmail only.
// NO public comments are posted about alt reports to avoid:
// - Exposing potentially false reports to the community
// - Embarrassing users named in reports
// - Creating drama in comment threads
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
      // Silently ignore invalid format - no public comment
      console.log(`Alt report ignored: mismatched types (${type1} vs ${type2})`);
      return;
    }

    const isUser = type1.toLowerCase() === 'u';
    const mainName = name1;
    const altName = name2;

    // Check rate limit (prevent spam)
    const author = comment.author || 'unknown';
    const rateCheck = await checkRateLimit(context.redis, 'altReport', author);
    if (!rateCheck.allowed) {
      console.log(`Alt report rate limited for ${author}`);
      return;
    }

    try {
      // Submit as PENDING report - requires mod approval
      const result = await submitPendingAltReport(context, {
        type: isUser ? 'user' : 'subreddit',
        altName,
        mainName,
        reportedBy: author,
        sourceCommentId: comment.id,
      });

      const prefix = isUser ? 'u' : 'r';

      if (!result.success) {
        // Log but don't post public comment
        console.log(`Alt report rejected: ${result.message}`);
        return;
      }

      // Send modmail for approval (the ONLY notification)
      const subreddit = await context.reddit.getCurrentSubreddit();
      const modmailBody = formatAltReportModmail(
        {
          id: result.reportId,
          type: isUser ? 'user' : 'subreddit',
          altName,
          mainName,
          reportedBy: author,
          reportedAt: Date.now(),
          sourceCommentId: comment.id,
          status: 'pending',
        },
        subreddit.name
      );

      await context.reddit.sendPrivateMessage({
        to: `/r/${subreddit.name}`,
        subject: `Alt Report: ${prefix}/${altName} -> ${prefix}/${mainName}`,
        text: modmailBody,
      });

      console.log(`Alt report submitted: ${prefix}/${altName} -> ${prefix}/${mainName} (${result.reportId})`);
      await consumeRateLimit(context.redis, 'altReport', author);
    } catch (error) {
      console.error('Alt report submission failed:', error);
    }
  },
});

// =============================================================================
// MODMAIL HANDLER FOR ALT APPROVAL/REJECTION
// Mods can reply to alt report modmail with:
//   !approve <report_id>
//   !reject <report_id>
// =============================================================================

Devvit.addTrigger({
  event: 'ModMail',
  onEvent: async (event, context) => {
    // Get message author and conversation ID
    const authorName = event.messageAuthor?.name;
    const conversationId = event.conversationId;
    const messageId = event.messageId;

    // Only process mod replies (not our own messages)
    if (!authorName || authorName === 'brigade-sentinel') return;
    if (!conversationId || !messageId) return;

    try {
      // Fetch the conversation to get the message body
      const conversationData = await context.reddit.modMail.getConversation({
        conversationId,
      });

      if (!conversationData?.conversation?.messages) {
        console.log('Could not fetch modmail conversation');
        return;
      }

      // Get the specific message body
      const message = conversationData.conversation.messages[messageId];
      const body = message?.body || message?.bodyMarkdown || '';

      if (!body) return;

      // Check for approval/rejection commands
      const approveMatch = body.match(/!approve\s+(alt_[\w]+)/i);
      const rejectMatch = body.match(/!reject\s+(alt_[\w]+)/i);

      if (!approveMatch && !rejectMatch) return;

      const reportId = approveMatch?.[1] || rejectMatch?.[1];
      if (!reportId) return;

      // Verify the report exists
      const report = await getAltReportById(context, reportId);
      if (!report) {
        console.log(`Alt report not found: ${reportId}`);
        return;
      }

      let result: { success: boolean; message: string };
      let action: string;

      if (approveMatch) {
        result = await approveAltReport(context, reportId);
        action = 'approved';
      } else {
        result = await rejectAltReport(context, reportId);
        action = 'rejected';
      }

      const prefix = report.type === 'user' ? 'u' : 'r';
      const subreddit = await context.reddit.getCurrentSubreddit();

      // Send confirmation modmail
      if (result.success) {
        await context.reddit.sendPrivateMessage({
          to: `/r/${subreddit.name}`,
          subject: `Alt Report ${action.charAt(0).toUpperCase() + action.slice(1)}: ${prefix}/${report.altName}`,
          text: `The alt report has been **${action}**.\n\n` +
                `- **Alt:** ${prefix}/${report.altName}\n` +
                `- **Main:** ${prefix}/${report.mainName}\n` +
                `- **Reported by:** u/${report.reportedBy}\n` +
                `- **Action by:** u/${authorName}\n\n` +
                (action === 'approved'
                  ? `Scores for ${prefix}/${report.altName} will now be combined with ${prefix}/${report.mainName} on the leaderboard.`
                  : `No changes were made to the leaderboard.`),
        });
      } else {
        await context.reddit.sendPrivateMessage({
          to: `/r/${subreddit.name}`,
          subject: `Alt Report Action Failed`,
          text: `Failed to ${action.replace('ed', '')} alt report: ${result.message}\n\nReport ID: ${reportId}`,
        });
      }

      console.log(`Alt report ${reportId} ${action} by ${authorName}: ${result.message}`);
    } catch (error) {
      console.error('Alt report action failed:', error);
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
    `reddit\.com/r/${targetSubreddit}/comments/([a-z0-9]+)`,
    'i'
  );
  const match = url.match(regex);
  return match ? `t3_${match[1]}` : null;
}


// Reply to users who respond to the bot (one reply only)
Devvit.addTrigger({
  event: 'CommentCreate',
  onEvent: async (event, context) => {
    if (!event.comment) return;

    const settings = await context.settings.getAll();
    if (!settings.enabled || !settings.enableBotReplies) return;

    const comment = event.comment;
    const authorName = comment.author;

    // Skip own comments and deleted
    if (!authorName || authorName === '[deleted]' || comment.deleted) return;

    // Must have a parent comment
    if (!comment.parentId || !comment.parentId.startsWith('t1_')) return;

    try {
      // Get the bot's username
      const currentUser = await context.reddit.getCurrentUser();
      if (!currentUser) return;
      const botUsername = currentUser.username;

      // Skip if author is the bot
      if (authorName === botUsername) return;

      // Get parent comment
      const parentComment = await context.reddit.getCommentById(comment.parentId);
      if (!parentComment || parentComment.authorName !== botUsername) return;

      // Check if grandparent is also the bot (avoid conversation loops)
      if (parentComment.parentId && parentComment.parentId.startsWith('t1_')) {
        const grandparent = await context.reddit.getCommentById(parentComment.parentId);
        if (grandparent && grandparent.authorName === botUsername) {
          // Bot already replied once in this chain, skip
          return;
        }
      }

      // Generate AI reply
      const reply = await generateBotReply(context, {
        botName: 'brigade-sentinel',
        botPersonality: 'A vigilant crosslink detection bot. Serious about community protection but not humorless.',
        originalBotComment: parentComment.body,
        userReply: comment.body,
        userUsername: authorName,
        geminiApiKey: settings.geminiApiKey as string | undefined,
      });

      if (!reply) return;

      // Post the reply
      await context.reddit.submitComment({
        id: comment.id,
        text: reply,
      });
    } catch (error) {
      console.error('Failed to reply to user:', error);
    }
  },
});

// =============================================================================
// TRAFFIC SPIKE DETECTION
// Tracks comment velocity per post - emits event when spike detected
// =============================================================================

Devvit.addTrigger({
  event: 'CommentCreate',
  onEvent: async (event, context) => {
    if (!event.comment?.postId) return;

    const settings = await context.settings.getAll();
    if (!settings.enabled || !settings.detectTrafficSpikes) return;

    const postId = event.comment.postId;
    const now = Date.now();

    // Get recent comment timestamps for this post
    const velocityKey = `${REDIS_PREFIX.brigade}velocity:${postId}`;
    const recentComments = await getJson<number[]>(context.redis, velocityKey) || [];

    // Add current timestamp, keep last hour
    const hourAgo = now - 60 * 60 * 1000;
    const filtered = [...recentComments.filter(t => t > hourAgo), now];
    await setJson(context.redis, velocityKey, filtered, 2 * 60 * 60); // 2 hour TTL

    // Calculate velocity (comments in last 5 minutes)
    const fiveMinAgo = now - 5 * 60 * 1000;
    const recentCount = filtered.filter(t => t > fiveMinAgo).length;

    // Check if spike detected (default: 10+ comments in 5 min)
    const threshold = (settings.velocityThreshold as number) || 10;
    if (recentCount >= threshold) {
      // Check if we already alerted for this post
      const alertKey = `${REDIS_PREFIX.brigade}spikeAlert:${postId}`;
      if (await context.redis.get(alertKey)) return;

      // Mark as alerted (1 hour cooldown)
      await context.redis.set(alertKey, '1', { expiration: new Date(now + 60 * 60 * 1000) });

      const subreddit = await context.reddit.getCurrentSubreddit();

      // Try to get post title for context
      let postTitle: string | undefined;
      try {
        const post = await context.reddit.getPostById(postId);
        postTitle = post?.title;
      } catch {
        // Post may be deleted
      }

      // Send spike alert to modmail
      await context.reddit.sendPrivateMessage({
        to: `/r/${subreddit.name}`,
        subject: `[TRAFFIC SPIKE] Unusual comment velocity detected`,
        text: `**Neural net pattern detected: Comment velocity anomaly**\n\n` +
              `Post: ${postTitle || postId}\n` +
              `Comments in last 5 min: **${recentCount}** (threshold: ${threshold})\n\n` +
              `Possible brigade in progress. Recommend visual inspection.\n\n` +
              `---\n*brigade-sentinel v2.0 | traffic_spike_detection*`,
      });

      // Emit to hub-widget events feed
      await emitTrafficSpike(context, subreddit.name, {
        postId,
        postTitle,
        commentsInWindow: recentCount,
        windowMinutes: 5,
        threshold,
      });

      console.log(`[SPIKE] Traffic spike detected on ${postId}: ${recentCount} comments in 5 min`);
    }
  },
});

export default Devvit;
