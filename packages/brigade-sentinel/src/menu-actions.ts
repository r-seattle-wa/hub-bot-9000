// Mod menu actions and wiki initialization for brigade-sentinel
import { Devvit, TriggerContext } from '@devvit/public-api';
import {
  getLeaderboard,
  LeaderboardData,
  HubBotEvent,
  analyzeAndRecordThread,
} from '@hub-bot/common';

type AppContext = Devvit.Context | TriggerContext;

// Wiki pages used by hub-bot-9000 ecosystem
export const WIKI_PAGES = {
  leaderboard: 'hub-bot-9000/hater-leaderboard',
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

    const factory = EMPTY_STRUCTURES[key as keyof typeof EMPTY_STRUCTURES];
    try {
      await reddit.createWikiPage({
        subredditName: subreddit,
        page,
        content: JSON.stringify(factory(), null, 2),
      });
      console.log(`[wiki] Created ${page}`);
    } catch (e) {
      console.error(`[wiki] Failed to create ${page}:`, e);
    }
  }
}

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

    context.ui.showToast('Analyzing thread...');

    const subreddit = await context.reddit.getCurrentSubredditName();
    const result = await analyzeAndRecordThread(context, url, subreddit);

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
}
