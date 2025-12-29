import { Devvit, TriggerContext } from '@devvit/public-api';
import {
  detectUnsubscribePost,
  couldBeUnsubscribePost,
  detectPoliticalComplaint,
} from './detector.js';
import { getUserStats } from './stats.js';
import { generateFarewellResponse, determineSarcasmLevel, generatePoliticalComplaintResponse } from './responses.js';
import {
  checkRateLimit,
  consumeRateLimit,
  isUserOptedOut,
  getJson,
  setJson,
  REDIS_PREFIX,
  SarcasmLevel,
  UserTone,
  SourceClassification,
  classifyUnsubscribeTone,
  emitFarewellAnnouncement,
  generateBotReply,
  // Meme detection
  detectTalkingPoints,
  recordTalkingPointUsage,
  getDebunkLinks,
  TalkingPoint,
  // Hater leaderboard
  recordHater,
  getLeaderboard,
  // Achievements
  checkAchievements,
  getHighestNewAchievement,
  markAchievementNotified,
  formatAchievementComment,
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
    name: 'sarcasmLevel',
    type: 'select',
    label: 'Default sarcasm level',
    options: [
      { label: 'Polite', value: 'polite' },
      { label: 'Neutral', value: 'neutral' },
      { label: 'Snarky', value: 'snarky' },
      { label: 'Roast', value: 'roast' },
      { label: 'Freakout', value: 'freakout' },
    ],
    defaultValue: ['neutral'],
  },
  {
    name: 'matchToneToUser',
    type: 'boolean',
    label: 'Match response tone to user tone',
    defaultValue: true,
  },
  {
    name: 'geminiApiKey',
    type: 'string',
    label: 'Gemini API Key (optional)',
    isSecret: true,
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
  {
    name: 'enableBotReplies',
    type: 'boolean',
    label: 'Reply to users who respond to the bot',
    defaultValue: true,
  },
  {
    name: 'trackDramaticExits',
    type: 'boolean',
    label: 'Add hostile/dramatic users to hater leaderboard',
    defaultValue: true,
  },
  {
    name: 'includeMemeDebunks',
    type: 'boolean',
    label: 'Include wiki links when talking points detected',
    defaultValue: true,
  },
]);


function getSarcasmLevelFromSetting(value: string[] | string | undefined): SarcasmLevel {
  const levelStr = Array.isArray(value) ? value[0] : value;
  switch (levelStr) {
    case 'polite': return SarcasmLevel.POLITE;
    case 'snarky': return SarcasmLevel.SNARKY;
    case 'roast': return SarcasmLevel.ROAST;
    case 'freakout': return SarcasmLevel.FREAKOUT;
    default: return SarcasmLevel.NEUTRAL;
  }
}

/**
 * Analyze farewell text for talking points and record to hater leaderboard if dramatic
 * Returns detected memes and any wiki debunk links to include in response
 */
interface FarewellAnalysis {
  detectedMemes: TalkingPoint[];
  debunkLinks: Array<{ text: string; url: string; summary: string }>;
  addedToLeaderboard: boolean;
  achievementText?: string;
}

async function analyzeFarewellForHaterTracking(
  context: TriggerContext,
  username: string,
  text: string,
  tone: UserTone,
  subredditName: string,
  settings: Record<string, unknown>
): Promise<FarewellAnalysis> {
  const result: FarewellAnalysis = {
    detectedMemes: [],
    debunkLinks: [],
    addedToLeaderboard: false,
  };

  // Detect talking points (echo chamber, transplants, etc.)
  result.detectedMemes = detectTalkingPoints(text);

  // Record talking point usage for the user
  for (const meme of result.detectedMemes) {
    await recordTalkingPointUsage(context, username, meme, text);
  }

  // Get debunk links if memes detected and setting enabled
  if (result.detectedMemes.length > 0 && settings.includeMemeDebunks) {
    result.debunkLinks = getDebunkLinks(subredditName, result.detectedMemes);
  }

  // Add to hater leaderboard if dramatic/hostile and setting enabled
  if (settings.trackDramaticExits) {
    // Determine classification based on tone and meme count
    let classification: SourceClassification | null = null;

    if (tone === UserTone.HOSTILE) {
      classification = SourceClassification.HATEFUL;
    } else if (tone === UserTone.DRAMATIC || tone === UserTone.FRUSTRATED) {
      classification = SourceClassification.ADVERSARIAL;
    } else if (result.detectedMemes.length >= 2) {
      // Multiple talking points = adversarial even if neutral tone
      classification = SourceClassification.ADVERSARIAL;
    }

    if (classification) {
      // Record to hater leaderboard
      // Use subreddit name as "source" since they're posting FROM here while complaining
      await recordHater(
        context,
        subredditName,  // They're already in this sub, complaining about it
        username,
        classification,
        `Farewell: ${text.slice(0, 80)}...`
      );
      result.addedToLeaderboard = true;

      // Check for achievements
      try {
        const leaderboard = await getLeaderboard(context);
        if (leaderboard) {
          const userKey = username.toLowerCase();
          const userEntry = leaderboard.users[userKey];

          if (userEntry) {
            const unlocks = await checkAchievements(
              context,
              username,
              userEntry,
              leaderboard,
              { repeatedMemes: result.detectedMemes.map(m => m.id) }
            );

            const highest = getHighestNewAchievement(unlocks);
            if (highest && highest.shouldNotify) {
              const score = userEntry.adversarialCount +
                           (userEntry.hatefulCount * 3) +
                           (userEntry.modLogSpamCount * 2);
              const position = leaderboard.topUsers.findIndex(
                u => u.username.toLowerCase() === userKey
              ) + 1;

              result.achievementText = formatAchievementComment(
                highest.achievement,
                username,
                position || 999,
                score,
                highest.achievement.roastTemplate
              );

              await markAchievementNotified(context, username, highest.achievement.id);
            }
          }
        }
      } catch (error) {
        console.error('[farewell-hero] Failed to check achievements:', error);
      }
    }
  }

  return result;
}

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
    
    // Check for political/echo chamber complaints (separate from leaving)
    const politicalComplaint = detectPoliticalComplaint(textToCheck);
    
    // If neither detected, return
    if (!detection.isUnsubscribePost && !politicalComplaint.isPoliticalComplaint) return;
    
    // For unsubscribe posts, check confidence threshold
    if (detection.isUnsubscribePost && detection.confidence < ((settings.minConfidence as number) || 0.6)) {
      // Still might respond to political complaint
      if (!politicalComplaint.isPoliticalComplaint) return;
    }

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

    // Classify user tone and determine sarcasm level
    const toneResult = await classifyUnsubscribeTone(textToCheck, settings.geminiApiKey as string | undefined);
    const defaultLevel = getSarcasmLevelFromSetting(settings.sarcasmLevel as string[]);
    let sarcasmLevel = determineSarcasmLevel(toneResult.tone, defaultLevel, settings.matchToneToUser as boolean || true);
    if (stats.isPowerUser && settings.respectPowerUsers) sarcasmLevel = SarcasmLevel.POLITE;

    // Track repeat announcements
    let repeatCount: number | undefined;
    if (settings.trackRepeatAnnouncements) {
      const repeatKey = `${REDIS_PREFIX.farewell}repeat:${authorId}`;
      const current = await getJson<{ count: number }>(context.redis, repeatKey);
      repeatCount = (current?.count || 0) + 1;
      await setJson(context.redis, repeatKey, { count: repeatCount }, 365 * 24 * 60 * 60); // 1 year
    }

    // Analyze for talking points and hater tracking
    const analysis = await analyzeFarewellForHaterTracking(
      context,
      user.username,
      textToCheck,
      toneResult.tone,
      subreddit.name,
      settings
    );

    // Generate response - check if political complaint should be appended
    let response = generateFarewellResponse(stats, sarcasmLevel, toneResult, repeatCount);

    // If political complaint detected, append survey reference
    if (politicalComplaint.isPoliticalComplaint) {
      const politicalResponse = generatePoliticalComplaintResponse(subreddit.name, politicalComplaint, sarcasmLevel);
      response += '\n\n---\n\n' + politicalResponse;
    }

    // Add debunk links if talking points were detected
    if (analysis.debunkLinks.length > 0) {
      response += '\n\n---\n\n**For your reference:**\n';
      for (const link of analysis.debunkLinks) {
        response += `- [${link.text}](${link.url}): ${link.summary}\n`;
      }
    }

    // Add achievement if unlocked
    if (analysis.achievementText) {
      response += '\n\n' + analysis.achievementText;
    }

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

    // Emit event to shared feed
    await emitFarewellAnnouncement(context, subreddit.name, {
      username: user.username,
      totalPosts: stats.totalPosts,
      totalComments: stats.totalComments,
      isPowerUser: stats.isPowerUser,
      sarcasmUsed: sarcasmLevel,
      detectedTone: toneResult.tone,
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
    
    // Check for political/echo chamber complaints
    const politicalComplaint = detectPoliticalComplaint(comment.body);
    
    // If neither detected, return
    if (!detection.isUnsubscribePost && !politicalComplaint.isPoliticalComplaint) return;
    
    // Require higher confidence for comments (less context)
    const minConfidence = Math.min(((settings.minConfidence as number) || 0.6) + 0.1, 0.9);
    if (detection.isUnsubscribePost && detection.confidence < minConfidence) {
      // Still might respond to political complaint
      if (!politicalComplaint.isPoliticalComplaint) return;
    }

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

    // Classify user tone and determine sarcasm level
    const toneResult = await classifyUnsubscribeTone(comment.body, settings.geminiApiKey as string | undefined);
    const defaultLevel = getSarcasmLevelFromSetting(settings.sarcasmLevel as string[]);
    let sarcasmLevel = determineSarcasmLevel(toneResult.tone, defaultLevel, settings.matchToneToUser as boolean || true);
    if (stats.isPowerUser && settings.respectPowerUsers) sarcasmLevel = SarcasmLevel.POLITE;

    // Track repeat announcements
    let repeatCount: number | undefined;
    if (settings.trackRepeatAnnouncements) {
      const repeatKey = `${REDIS_PREFIX.farewell}repeat:${authorName}`;
      const current = await getJson<{ count: number }>(context.redis, repeatKey);
      repeatCount = (current?.count || 0) + 1;
      await setJson(context.redis, repeatKey, { count: repeatCount }, 365 * 24 * 60 * 60);
    }

    // Analyze for talking points and hater tracking
    const analysis = await analyzeFarewellForHaterTracking(
      context,
      authorName,
      comment.body,
      toneResult.tone,
      subreddit.name,
      settings
    );

    // Generate response - check if political complaint should be appended
    let response = generateFarewellResponse(stats, sarcasmLevel, toneResult, repeatCount);

    // If political complaint detected, append survey reference
    if (politicalComplaint.isPoliticalComplaint) {
      const politicalResponse = generatePoliticalComplaintResponse(subreddit.name, politicalComplaint, sarcasmLevel);
      response += '\n\n---\n\n' + politicalResponse;
    }

    // Add debunk links if talking points were detected
    if (analysis.debunkLinks.length > 0) {
      response += '\n\n---\n\n**For your reference:**\n';
      for (const link of analysis.debunkLinks) {
        response += `- [${link.text}](${link.url}): ${link.summary}\n`;
      }
    }

    // Add achievement if unlocked
    if (analysis.achievementText) {
      response += '\n\n' + analysis.achievementText;
    }

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

    // Emit event to shared feed
    await emitFarewellAnnouncement(context, subreddit.name, {
      username: authorName,
      totalPosts: stats.totalPosts,
      totalComments: stats.totalComments,
      isPowerUser: stats.isPowerUser,
      sarcasmUsed: sarcasmLevel,
      detectedTone: toneResult.tone,
    });
  },
});


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
        botName: 'farewell-hero',
        botPersonality: 'A witty farewell statistics bot. Matches energy with departing users. Appreciates dramatic exits.',
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

export default Devvit;
