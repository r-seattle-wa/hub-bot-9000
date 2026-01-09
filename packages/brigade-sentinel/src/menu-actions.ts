// Mod menu actions and wiki initialization for brigade-sentinel
import { Devvit, TriggerContext } from '@devvit/public-api';
import {
  getLeaderboard,
  LeaderboardData,
  HubBotEvent,
  analyzeAndRecordThread,
  analyzeThreadForBrigade,
  formatBrigadeReport,
  formatBrigadeAlert,
  BrigadeEvidence,
  updateHallOfShame,
  HALL_OF_SHAME_WIKI,
} from '@hub-bot/common';

type AppContext = Devvit.Context | TriggerContext;

// Wiki pages used by hub-bot-9000 ecosystem
export const WIKI_PAGES = {
  leaderboard: 'hub-bot-9000/hater-leaderboard',
  hallOfShame: 'hub-bot-9000/hall-of-shame',
  eventsFeed: 'hub-bot-9000/events-feed',
  communityEvents: 'hub-bot-9000/community-events',
  achievements: 'hub-bot-9000/user-achievements',
  optOut: 'hub-bot-9000/opt-out',
} as const;

// Default empty structures for each wiki page
const EMPTY_STRUCTURES = {
  leaderboard: (): LeaderboardData => ({
    updatedAt: Date.now(),
    totalHostileLinks: 0,
    subreddits: {},
    subredditAltMappings: {},
    topSubreddits: [],
    users: {},
    userAltMappings: {},
    topUsers: [],
  }),
  eventsFeed: () => ({ updatedAt: Date.now(), events: [] as HubBotEvent[] }),
  communityEvents: () => ({ updatedAt: Date.now(), location: '', events: [] }),
  achievements: () => ({ updatedAt: Date.now(), users: {} }),
  optOut: () => ({ updatedAt: Date.now(), users: [] }),
};

/**
 * Initialize all wiki pages on app install
 */
export async function initializeWikiPages(context: AppContext): Promise<void> {
  const { reddit } = context;
  const subreddit = await reddit.getCurrentSubredditName();

  for (const [key, page] of Object.entries(WIKI_PAGES)) {
    try {
      const existing = await reddit.getWikiPage(subreddit, page);
      if (existing?.content) continue;
    } catch {
      // Page doesn't exist
    }

    // Determine content based on page type
    let content: string;
    if (key === 'hallOfShame') {
      // Hall of Shame is markdown, not JSON
      content = `# 🏛️ The Hall of Shame

*r/${subreddit}'s Official Registry of Distinguished Haters*

---

*No data yet. Run "Analyze Drama Thread" or wait for automatic detection.*

---

*Tracked by brigade-sentinel | Updated periodically*`;
    } else {
      const factory = EMPTY_STRUCTURES[key as keyof typeof EMPTY_STRUCTURES];
      if (!factory) {
        console.log(`[wiki] No factory for ${key}, skipping`);
        continue;
      }
      content = JSON.stringify(factory(), null, 2);
    }

    try {
      await reddit.createWikiPage({
        subredditName: subreddit,
        page,
        content,
      });
      console.log(`[wiki] Created ${page}`);
    } catch (e) {
      console.error(`[wiki] Failed to create ${page}:`, e);
    }
  }
}

// Analyze thread for brigade evidence (by URL - can analyze any subreddit)
const brigadeAnalysisForm = Devvit.createForm(
  {
    title: 'Analyze Thread for Brigade Evidence',
    description: 'Paste any Reddit thread URL to analyze for coordinated activity',
    fields: [
      {
        name: 'url',
        label: 'Reddit Thread URL',
        type: 'string',
        helpText: 'e.g., https://reddit.com/r/SeattleWA/comments/1q3hgkt/...',
      },
    ],
    acceptLabel: 'Analyze',
  },
  async (event, context) => {
    const url = event.values.url as string;
    if (!url?.trim()) {
      context.ui.showToast('No URL provided');
      return;
    }

    // Extract post ID from URL
    const match = url.match(/comments\/([a-z0-9]+)/i);
    if (!match) {
      context.ui.showToast('Invalid Reddit URL - must be a comments page');
      return;
    }

    const postId = `t3_${match[1]}`;
    context.ui.showToast('Analyzing thread for brigade evidence... This may take 1-2 minutes.');

    try {
      const evidence = await analyzeThreadForBrigade(context, postId, {
        maxComments: 200,
        historyDepth: 100,
        includeDeleted: true,
      });

      // Send detailed report to modmail
      const subreddit = await context.reddit.getCurrentSubredditName();
      const report = formatBrigadeReport(evidence);

      await context.reddit.sendPrivateMessage({
        to: `/r/${subreddit}`,
        subject: `[${evidence.confidence.toUpperCase()}] Brigade Analysis: ${evidence.postTitle.slice(0, 50)}...`,
        text: report,
      });

      // Show summary toast
      const topSource = evidence.topSourceSubreddits[0];
      const sourceInfo = topSource
        ? ` Top source: r/${topSource.subreddit} (${topSource.count} users).`
        : '';

      context.ui.showToast({
        text: `${evidence.confidence.toUpperCase()}: ${evidence.firstTimePosters}/${evidence.uniqueCommenters} first-time posters (${evidence.firstTimePosterPercentage}%).${sourceInfo} Full report in modmail.`,
        appearance: evidence.confidenceScore >= 30 ? 'success' : 'neutral',
      });
    } catch (error) {
      console.error('[brigade-analysis] Failed:', error);
      context.ui.showToast({ text: `Analysis failed: ${error}`, appearance: 'neutral' });
    }
  }
);

// Analyze thread form
const analyzeForm = Devvit.createForm(
  {
    title: 'Analyze Drama Thread',
    description: 'Paste a Reddit URL to analyze for haters (e.g., SubredditDrama post)',
    fields: [
      {
        name: 'url',
        label: 'Reddit Thread URL',
        type: 'string',
        helpText: 'e.g., https://reddit.com/r/SubredditDrama/comments/abc123/...',
      },
    ],
    acceptLabel: 'Analyze',
  },
  async (event, context) => {
    const url = event.values.url as string;
    if (!url?.trim()) {
      context.ui.showToast('No URL provided');
      return;
    }

    // Get the home subreddit - use setting if configured, else installed subreddit
    const settings = await context.settings.getAll();
    const installedSub = await context.reddit.getCurrentSubredditName();
    const homeSubreddit = (settings.homeSubreddit as string)?.trim() || installedSub;

    context.ui.showToast(`Analyzing thread (target: r/${homeSubreddit})...`);

    const result = await analyzeAndRecordThread(context, url, homeSubreddit);

    context.ui.showToast({
      text: result.message,
      appearance: result.success ? 'success' : 'neutral',
    });
  }
);

/**
 * Register mod menu actions
 */
export function registerMenuActions(): void {
  // Analyze a drama thread
  Devvit.addMenuItem({
    label: 'Analyze Drama Thread',
    location: 'subreddit',
    forUserType: 'moderator',
    onPress: (_, ctx) => ctx.ui.showForm(analyzeForm),
  });

  // View leaderboard
  Devvit.addMenuItem({
    label: 'View Hater Leaderboard',
    location: 'subreddit',
    forUserType: 'moderator',
    onPress: async (_, ctx) => {
      const sub = await ctx.reddit.getCurrentSubredditName();
      const leaderboard = await getLeaderboard(ctx);
      const count = leaderboard ? Object.keys(leaderboard.users).length : 0;
      ctx.ui.showToast({
        text: `${count} haters tracked. View: reddit.com/r/${sub}/wiki/${WIKI_PAGES.leaderboard}`,
        appearance: 'success',
      });
    },
  });

  // Analyze any thread for brigade evidence (URL-based)
  Devvit.addMenuItem({
    label: 'Analyze Thread for Brigade (URL)',
    location: 'subreddit',
    forUserType: 'moderator',
    onPress: (_, ctx) => ctx.ui.showForm(brigadeAnalysisForm),
  });

  // Force crosslink scan
  Devvit.addMenuItem({
    label: 'Scan for Crosslinks Now',
    location: 'subreddit',
    forUserType: 'moderator',
    onPress: async (_, ctx) => {
      await ctx.scheduler.runJob({ name: 'scanForCrosslinks', runAt: new Date(Date.now() + 1000) });
      ctx.ui.showToast('Crosslink scan queued');
    },
  });

  // Analyze a post in our subreddit for brigade evidence
  Devvit.addMenuItem({
    label: 'Analyze for Brigade',
    location: 'post',
    forUserType: 'moderator',
    onPress: async (event, ctx) => {
      const postId = event.targetId;
      if (!postId) {
        ctx.ui.showToast('No post selected');
        return;
      }

      ctx.ui.showToast('Analyzing thread for brigade evidence... This may take a minute.');

      try {
        const evidence = await analyzeThreadForBrigade(ctx, postId, {
          maxComments: 200,
          historyDepth: 100,
          includeDeleted: true,
        });

        // Send detailed report to modmail
        const subreddit = await ctx.reddit.getCurrentSubredditName();
        const report = formatBrigadeReport(evidence);

        await ctx.reddit.sendPrivateMessage({
          to: `/r/${subreddit}`,
          subject: `[${evidence.confidence.toUpperCase()}] Brigade Analysis: ${evidence.postTitle.slice(0, 50)}...`,
          text: report,
        });

        // Show summary toast
        ctx.ui.showToast({
          text: `${evidence.confidence.toUpperCase()} confidence - ${evidence.firstTimePosters}/${evidence.uniqueCommenters} first-time posters. Full report sent to modmail.`,
          appearance: evidence.confidence === 'low' ? 'neutral' : 'success',
        });
      } catch (error) {
        console.error('[brigade-analysis] Failed:', error);
        ctx.ui.showToast({ text: 'Analysis failed - check logs', appearance: 'neutral' });
      }
    },
  });

  // Update Hall of Shame (human-readable leaderboard)
  Devvit.addMenuItem({
    label: 'Update Hall of Shame',
    location: 'subreddit',
    forUserType: 'moderator',
    onPress: async (_, ctx) => {
      ctx.ui.showToast('Updating Hall of Shame...');

      const settings = await ctx.settings.getAll();
      const installedSub = await ctx.reddit.getCurrentSubredditName();
      const homeSubreddit = (settings.homeSubreddit as string)?.trim() || installedSub;

      const result = await updateHallOfShame(ctx, homeSubreddit);

      ctx.ui.showToast({
        text: result.success
          ? `Hall of Shame updated! View at /r/${installedSub}/wiki/${HALL_OF_SHAME_WIKI}`
          : result.message,
        appearance: result.success ? 'success' : 'neutral',
      });
    },
  });
}
