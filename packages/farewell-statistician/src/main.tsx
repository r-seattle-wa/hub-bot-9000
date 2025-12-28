import { Devvit } from '@devvit/public-api';
import {
  detectUnsubscribePost,
  couldBeUnsubscribePost,
} from './detector.js';
import { getUserStats } from './stats.js';
import { generateFarewellResponse } from './responses.js';
import {
  checkRateLimit,
  consumeRateLimit,
  isUserOptedOut,
  getJson,
  setJson,
  REDIS_PREFIX,
} from '@hub-bot/common';
// Note: isUserOptedOut now uses wiki storage (shared across apps)

Devvit.configure({
  redditAPI: true,
  redis: true,
});

// App settings
Devvit.addSettings([
  {
    name: 'enabled',
    type: 'boolean',
    label: 'Enable farewell detection',
    defaultValue: true,
  },
  {
    name: 'minConfidence',
    type: 'number',
    label: 'Minimum detection confidence (0.0-1.0)',
    defaultValue: 0.6,
  },
  {
    name: 'includeLurkerRoasts',
    type: 'boolean',
    label: 'Include playful responses for low-activity users',
    defaultValue: true,
  },
  {
    name: 'respectPowerUsers',
    type: 'boolean',
    label: 'Use respectful tone for high-contribution users',
    defaultValue: true,
  },
  {
    name: 'powerUserThreshold',
    type: 'number',
    label: 'Posts + comments to qualify as power user',
    defaultValue: 50,
  },
  {
    name: 'cooldownHours',
    type: 'number',
    label: 'Hours between replies to same user',
    defaultValue: 24,
  },
  {
    name: 'trackRepeatAnnouncements',
    type: 'boolean',
    label: 'Track users who announce leaving multiple times',
    defaultValue: true,
  },
  {
    name: 'replyDelaySeconds',
    type: 'number',
    label: 'Delay before posting reply (seconds)',
    defaultValue: 60,
  },
]);

// Scheduled job to post farewell reply after delay
Devvit.addSchedulerJob({
  name: 'postFarewellReply',
  onRun: async (event, context) => {
    const { targetId, response, username } = event.data as {
      targetId: string;
      response: string;
      username: string;
    };

    try {
      await context.reddit.submitComment({
        id: targetId,
        text: response,
      });

      await consumeRateLimit(context.redis, 'userComment', username);

      // Track stats
      const statsKey = `${REDIS_PREFIX.farewell}stats:total`;
      const current = await context.redis.get(statsKey);
      await context.redis.set(statsKey, String((parseInt(current || '0', 10) || 0) + 1));
    } catch (error) {
      console.error('Failed to post farewell response:', error);
    }
  },
});

// Post trigger
Devvit.addTrigger({
  event: 'PostCreate',
  onEvent: async (event, context) => {
    if (!event.post) return;

    const settings = await context.settings.getAll();
    if (!settings.enabled) return;

    const post = event.post;
    const authorId = post.authorId;

    if (!authorId || post.deleted) return;

    // Quick filter
    const textToCheck = `${post.title} ${post.selftext || ''}`;
    if (!couldBeUnsubscribePost(textToCheck)) return;

    // Detect unsubscribe announcement
    const detection = detectUnsubscribePost(textToCheck);
    if (!detection.isUnsubscribePost) return;
    if (detection.confidence < ((settings.minConfidence as number) || 0.6)) return;

    // Get author info
    const user = await context.reddit.getUserById(authorId);
    if (!user) return;

    // Check if user opted out (wiki-based, uses username)
    if (await isUserOptedOut(context, user.username)) return;

    // Check rate limit
    const rateCheck = await checkRateLimit(context.redis, 'userComment', authorId);
    if (!rateCheck.allowed) return;

    // Get user stats
    const subreddit = await context.reddit.getCurrentSubreddit();
    const stats = await getUserStats(
      context,
      user.username,
      subreddit.name,
      (settings.powerUserThreshold as number) || 50
    );

    if (!stats) return;

    // Skip lurker roasts if disabled
    if (stats.isLurker && !settings.includeLurkerRoasts) return;

    // Track repeat announcements
    let repeatCount: number | undefined;
    if (settings.trackRepeatAnnouncements) {
      const repeatKey = `${REDIS_PREFIX.farewell}repeat:${authorId}`;
      const current = await getJson<{ count: number }>(context.redis, repeatKey);
      repeatCount = (current?.count || 0) + 1;
      await setJson(context.redis, repeatKey, { count: repeatCount }, 365 * 24 * 60 * 60); // 1 year
    }

    // Generate response and schedule delayed reply
    const response = generateFarewellResponse(stats, repeatCount);
    const delaySeconds = (settings.replyDelaySeconds as number) || 60;

    await context.scheduler.runJob({
      name: 'postFarewellReply',
      data: {
        targetId: post.id,
        response,
        username: user.username,
      },
      runAt: new Date(Date.now() + delaySeconds * 1000),
    });
  },
});

// Comment trigger (for comments announcing departure)
Devvit.addTrigger({
  event: 'CommentCreate',
  onEvent: async (event, context) => {
    if (!event.comment) return;

    const settings = await context.settings.getAll();
    if (!settings.enabled) return;

    const comment = event.comment;
    const authorName = comment.author;

    if (!authorName || authorName === '[deleted]' || authorName === 'AutoModerator' || comment.deleted) {
      return;
    }

    // Quick filter
    if (!couldBeUnsubscribePost(comment.body)) return;

    // Check if user opted out (wiki-based, uses username)
    if (await isUserOptedOut(context, authorName)) return;

    // Detect unsubscribe announcement
    const detection = detectUnsubscribePost(comment.body);
    if (!detection.isUnsubscribePost) return;

    // Require higher confidence for comments (less context)
    const minConfidence = Math.min(((settings.minConfidence as number) || 0.6) + 0.1, 0.9);
    if (detection.confidence < minConfidence) return;

    // Check rate limit
    const rateCheck = await checkRateLimit(context.redis, 'userComment', authorName);
    if (!rateCheck.allowed) return;

    // Get user stats
    const subreddit = await context.reddit.getCurrentSubreddit();
    const stats = await getUserStats(
      context,
      authorName,
      subreddit.name,
      (settings.powerUserThreshold as number) || 50
    );

    if (!stats) return;

    // Skip lurker roasts if disabled
    if (stats.isLurker && !settings.includeLurkerRoasts) return;

    // Track repeat announcements
    let repeatCount: number | undefined;
    if (settings.trackRepeatAnnouncements) {
      const repeatKey = `${REDIS_PREFIX.farewell}repeat:${authorName}`;
      const current = await getJson<{ count: number }>(context.redis, repeatKey);
      repeatCount = (current?.count || 0) + 1;
      await setJson(context.redis, repeatKey, { count: repeatCount }, 365 * 24 * 60 * 60);
    }

    // Generate response and schedule delayed reply
    const response = generateFarewellResponse(stats, repeatCount);
    const delaySeconds = (settings.replyDelaySeconds as number) || 60;

    await context.scheduler.runJob({
      name: 'postFarewellReply',
      data: {
        targetId: comment.id,
        response,
        username: authorName,
      },
      runAt: new Date(Date.now() + delaySeconds * 1000),
    });
  },
});

export default Devvit;
