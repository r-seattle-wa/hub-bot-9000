// User statistics collection and formatting

import { Devvit, TriggerContext } from '@devvit/public-api';
import { checkNotableContributor } from '@hub-bot/common';

export interface UserSubredditStats {
  username: string;
  subreddit: string;

  // Post stats
  totalPosts: number;
  postKarma: number;
  firstPostDate: Date | null;
  lastPostDate: Date | null;

  // Comment stats
  totalComments: number;
  commentKarma: number;
  firstCommentDate: Date | null;
  lastCommentDate: Date | null;

  // Account info
  accountAge: string;
  totalKarma: number;

  // Computed
  daysSinceFirstActivity: number | null;
  isLurker: boolean;
  isPowerUser: boolean;

  // Notable contributor (from sub-stats-bot wiki)
  isNotableContributor: boolean;
  notableYears: number[];
}

/**
 * Gather user's activity stats in a subreddit
 */
export async function getUserStats(
  context: TriggerContext,
  username: string,
  subredditName: string,
  powerUserThreshold: number = 50
): Promise<UserSubredditStats | null> {
  try {
    // Get user info
    const user = await context.reddit.getUserByUsername(username);
    if (!user) return null;

    const accountCreated = new Date(user.createdAt);
    const now = new Date();
    const accountAgeDays = Math.floor(
      (now.getTime() - accountCreated.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Format account age
    let accountAge: string;
    if (accountAgeDays < 30) {
      accountAge = `${accountAgeDays} days`;
    } else if (accountAgeDays < 365) {
      accountAge = `${Math.floor(accountAgeDays / 30)} months`;
    } else {
      const years = Math.floor(accountAgeDays / 365);
      const months = Math.floor((accountAgeDays % 365) / 30);
      accountAge = months > 0 ? `${years}y ${months}m` : `${years} years`;
    }

    // Get user's posts in subreddit
    let totalPosts = 0;
    let postKarma = 0;
    let firstPostDate: Date | null = null;
    let lastPostDate: Date | null = null;

    try {
      const posts = await context.reddit
        .getPostsByUser({
          username,
          limit: 100,
          sort: 'new',
        })
        .all();

      const subredditPosts = posts.filter(
        (p) => p.subredditName.toLowerCase() === subredditName.toLowerCase()
      );

      totalPosts = subredditPosts.length;
      postKarma = subredditPosts.reduce((sum, p) => sum + p.score, 0);

      if (subredditPosts.length > 0) {
        const dates = subredditPosts.map((p) => new Date(p.createdAt));
        firstPostDate = new Date(Math.min(...dates.map((d) => d.getTime())));
        lastPostDate = new Date(Math.max(...dates.map((d) => d.getTime())));
      }
    } catch {
      // User may have private history
    }

    // Get user's comments in subreddit
    let totalComments = 0;
    let commentKarma = 0;
    let firstCommentDate: Date | null = null;
    let lastCommentDate: Date | null = null;

    try {
      const comments = await context.reddit
        .getCommentsByUser({
          username,
          limit: 100,
          sort: 'new',
        })
        .all();

      const subredditComments = comments.filter(
        (c) => c.subredditName.toLowerCase() === subredditName.toLowerCase()
      );

      totalComments = subredditComments.length;
      commentKarma = subredditComments.reduce((sum, c) => sum + c.score, 0);

      if (subredditComments.length > 0) {
        const dates = subredditComments.map((c) => new Date(c.createdAt));
        firstCommentDate = new Date(Math.min(...dates.map((d) => d.getTime())));
        lastCommentDate = new Date(Math.max(...dates.map((d) => d.getTime())));
      }
    } catch {
      // User may have private history
    }

    // Calculate first activity
    let daysSinceFirstActivity: number | null = null;
    const firstActivity =
      firstPostDate && firstCommentDate
        ? new Date(Math.min(firstPostDate.getTime(), firstCommentDate.getTime()))
        : firstPostDate || firstCommentDate;

    if (firstActivity) {
      daysSinceFirstActivity = Math.floor(
        (now.getTime() - firstActivity.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    const totalActivity = totalPosts + totalComments;

    // Check if user was a notable contributor (appeared in sub-stats-bot top lists)
    let isNotableContributor = false;
    let notableYears: number[] = [];
    try {
      const notable = await checkNotableContributor(context, username, subredditName);
      isNotableContributor = notable.isNotable;
      notableYears = notable.years;
    } catch {
      // Wiki may not be available, skip
    }

    return {
      username,
      subreddit: subredditName,
      totalPosts,
      postKarma,
      firstPostDate,
      lastPostDate,
      totalComments,
      commentKarma,
      firstCommentDate,
      lastCommentDate,
      accountAge,
      totalKarma: (user.linkKarma || 0) + (user.commentKarma || 0),
      daysSinceFirstActivity,
      isLurker: totalActivity <= 3,
      isPowerUser: totalActivity >= powerUserThreshold,
      isNotableContributor,
      notableYears,
    };
  } catch (error) {
    console.error('Failed to get user stats:', error);
    return null;
  }
}

/**
 * Format date for display
 */
function formatDate(date: Date | null): string {
  if (!date) return 'Never';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format stats as markdown table
 */
export function formatStatsTable(stats: UserSubredditStats): string {
  let table = `| Metric | Value |
|--------|-------|
| Posts in r/${stats.subreddit} | ${stats.totalPosts} |
| Comments in r/${stats.subreddit} | ${stats.totalComments} |
| Post Karma Here | ${stats.postKarma} |
| Comment Karma Here | ${stats.commentKarma} |
| First Activity | ${formatDate(stats.firstPostDate || stats.firstCommentDate)} |
| Account Age | ${stats.accountAge} |`;

  // Add notable contributor badge if applicable
  if (stats.isNotableContributor && stats.notableYears.length > 0) {
    const years = stats.notableYears.join(', ');
    table += `\n| Top Contributor | ${years} |`;
  }

  return table;
}
