import { Devvit } from '@devvit/public-api';
import { detectHaiku, formatHaiku, couldBeHaiku } from './detector.js';
import {
  getHaikuFooter,
  checkRateLimit,
  consumeRateLimit,
  isUserOptedOut,
  REDIS_PREFIX,
} from '@hub-bot/common';

Devvit.configure({
  redditAPI: true,
  redis: true,
});

// App settings
Devvit.addSettings([
  {
    name: 'enabled',
    type: 'boolean',
    label: 'Enable haiku detection',
    defaultValue: true,
  },
  {
    name: 'minKarma',
    type: 'number',
    label: 'Minimum author karma to respond to',
    defaultValue: 10,
  },
  {
    name: 'cooldownMinutes',
    type: 'number',
    label: 'Cooldown between replies to same user (minutes)',
    defaultValue: 60,
  },
  {
    name: 'excludeFlairs',
    type: 'string',
    label: 'Post flairs to ignore (comma-separated)',
    defaultValue: 'Serious,News,Megathread',
  },
  {
    name: 'replyDelaySeconds',
    type: 'number',
    label: 'Delay before posting reply (seconds)',
    defaultValue: 30,
  },
]);

// Scheduled job to post haiku reply after delay
Devvit.addSchedulerJob({
  name: 'postHaikuReply',
  onRun: async (event, context) => {
    const { targetId, haiku, username, isPost } = event.data as {
      targetId: string;
      haiku: string;
      username: string;
      isPost: boolean;
    };

    try {
      const intro = isPost ? 'Your post contains a haiku:' : 'A haiku emerged:';
      const reply = `${intro}\n\n${haiku}${getHaikuFooter()}`;

      await context.reddit.submitComment({
        id: targetId,
        text: reply,
      });

      // Record rate limit consumption
      await consumeRateLimit(context.redis, 'userHaiku', username);

      // Track haiku for fun stats
      const statsKey = `${REDIS_PREFIX.haiku}stats:total`;
      const current = await context.redis.get(statsKey);
      await context.redis.set(statsKey, String((parseInt(current || '0', 10) || 0) + 1));
    } catch (error) {
      console.error('Failed to post haiku reply:', error);
    }
  },
});

// Comment trigger
Devvit.addTrigger({
  event: 'CommentCreate',
  onEvent: async (event, context) => {
    if (!event.comment) return;

    const settings = await context.settings.getAll();
    if (!settings.enabled) return;

    const comment = event.comment;
    const authorName = comment.author;

    // Skip if author is a bot or deleted
    if (!authorName || authorName === '[deleted]' || authorName === 'AutoModerator' || comment.deleted) {
      return;
    }

    // Quick filter
    if (!couldBeHaiku(comment.body)) return;

    // Check if user opted out (wiki-based)
    if (await isUserOptedOut(context, authorName)) return;

    // Check rate limit
    const rateCheck = await checkRateLimit(context.redis, 'userHaiku', authorName);
    if (!rateCheck.allowed) return;

    // Detect haiku
    const result = detectHaiku(comment.body);
    if (!result.isHaiku || !result.lines) return;

    // Check minimum karma
    try {
      const author = await context.reddit.getUserByUsername(authorName);
      const totalKarma = author ? (author.linkKarma || 0) + (author.commentKarma || 0) : 0;
      if (totalKarma < (settings.minKarma as number || 10)) {
        return;
      }
    } catch {
      // Skip if we can't get user info
      return;
    }

    // Check post flair exclusions
    try {
      const post = await context.reddit.getPostById(comment.postId);
      const excludeFlairs = ((settings.excludeFlairs as string) || '')
        .split(',')
        .map(f => f.trim().toLowerCase())
        .filter(f => f.length > 0);

      if (post?.flair?.text && excludeFlairs.includes(post.flair.text.toLowerCase())) {
        return;
      }
    } catch {
      // Continue if we can't get post info
    }

    // Schedule delayed reply
    const formattedHaiku = formatHaiku(result.lines);
    const delaySeconds = (settings.replyDelaySeconds as number) || 30;

    await context.scheduler.runJob({
      name: 'postHaikuReply',
      data: {
        targetId: comment.id,
        haiku: formattedHaiku,
        username: authorName,
        isPost: false,
      },
      runAt: new Date(Date.now() + delaySeconds * 1000),
    });
  },
});

// Post trigger (for post titles/body)
Devvit.addTrigger({
  event: 'PostCreate',
  onEvent: async (event, context) => {
    if (!event.post) return;

    const settings = await context.settings.getAll();
    if (!settings.enabled) return;

    const post = event.post;
    const authorId = post.authorId;

    if (!authorId || post.deleted) return;

    // Check title for haiku (quick filter)
    const textToCheck = post.title + (post.selftext ? ' ' + post.selftext : '');
    if (!couldBeHaiku(textToCheck)) return;

    // Get author info (need username for opt-out check)
    const user = await context.reddit.getUserById(authorId);
    if (!user) return;

    // Check if user opted out (wiki-based)
    if (await isUserOptedOut(context, user.username)) return;

    // Check rate limit
    const rateCheck = await checkRateLimit(context.redis, 'userHaiku', user.username);
    if (!rateCheck.allowed) return;

    // Try title first, then combined
    let result = detectHaiku(post.title);
    if (!result.isHaiku && post.selftext) {
      result = detectHaiku(textToCheck);
    }

    if (!result.isHaiku || !result.lines) return;

    // Check flair exclusions
    const excludeFlairs = ((settings.excludeFlairs as string) || '')
      .split(',')
      .map(f => f.trim().toLowerCase())
      .filter(f => f.length > 0);

    if (post.linkFlair?.text && excludeFlairs.includes(post.linkFlair.text.toLowerCase())) {
      return;
    }

    // Schedule delayed reply
    const formattedHaiku = formatHaiku(result.lines);
    const delaySeconds = (settings.replyDelaySeconds as number) || 30;

    await context.scheduler.runJob({
      name: 'postHaikuReply',
      data: {
        targetId: post.id,
        haiku: formattedHaiku,
        username: user.username,
        isPost: true,
      },
      runAt: new Date(Date.now() + delaySeconds * 1000),
    });
  },
});

export default Devvit;
