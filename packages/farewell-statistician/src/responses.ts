// Response templates for farewell-hero

import { UserSubredditStats, formatStatsTable } from './stats.js';
import { getStatsFooter } from '@hub-bot/common';

/**
 * Witty responses for lurkers (low activity)
 */
const LURKER_RESPONSES = [
  "Ah yes, we'll definitely notice the absence of your... *checks notes* ...{totalActivity} contributions.",
  "The subreddit will never be the same without your {totalActivity} posts and comments.",
  "Your {totalActivity} contributions will be sorely missed. Truly, a legend leaves us.",
  "With {totalActivity} posts/comments over {timespan}, you've been... present. Technically.",
];

/**
 * Respectful responses for power users (high activity)
 */
const POWER_USER_RESPONSES = [
  "Genuinely, thank you for {totalPosts} posts and {totalComments} comments. Your contributions mattered.",
  "After {timespan} and {totalActivity} contributions, we're sorry to see you go. Thanks for being part of the community.",
  "Your {totalActivity} contributions over {timespan} made a difference here. Best wishes wherever you land.",
];

/**
 * Special responses for notable contributors (appeared in sub-stats-bot top lists)
 */
const NOTABLE_CONTRIBUTOR_RESPONSES = [
  "You've been a top contributor here. The subreddit statistics will remember you.",
  "You made it to the top contributor lists. That's actually impressive. Best of luck.",
  "A verified top contributor leaves us. The wiki pages will tell your legend.",
];

/**
 * Standard responses for average users
 */
const STANDARD_RESPONSES = [
  "For the record, here's your r/{subreddit} journey.",
  "Before you go, here's a look back at your time here.",
  "Your r/{subreddit} stats, for posterity.",
  "A statistical farewell:",
];

/**
 * Responses for repeat announcers
 */
const REPEAT_RESPONSES = [
  "Welcome back! This is announcement #{count}. See you next time!",
  "Ah, the {ordinal} farewell. Always a classic.",
];

/**
 * Get ordinal suffix
 */
function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Format timespan in human readable form
 */
function formatTimespan(days: number | null): string {
  if (!days || days < 1) return 'today';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return months === 1 ? '1 month' : `${months} months`;
  }
  const years = Math.floor(days / 365);
  const remainingMonths = Math.floor((days % 365) / 30);
  if (remainingMonths === 0) {
    return years === 1 ? '1 year' : `${years} years`;
  }
  return `${years}y ${remainingMonths}m`;
}

/**
 * Pick a random item from an array
 */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate farewell response based on user stats
 */
export function generateFarewellResponse(
  stats: UserSubredditStats,
  repeatCount?: number
): string {
  const totalActivity = stats.totalPosts + stats.totalComments;
  const timespan = formatTimespan(stats.daysSinceFirstActivity);

  let intro: string;

  // Check for repeat announcer
  if (repeatCount && repeatCount > 1) {
    intro = pickRandom(REPEAT_RESPONSES)
      .replace('{count}', String(repeatCount))
      .replace('{ordinal}', getOrdinal(repeatCount));
  }
  // Check for lurker
  else if (stats.isLurker) {
    intro = pickRandom(LURKER_RESPONSES)
      .replace('{totalActivity}', String(totalActivity))
      .replace('{timespan}', timespan);
  }
  // Check for notable contributor (from sub-stats-bot wiki)
  else if (stats.isNotableContributor) {
    intro = pickRandom(NOTABLE_CONTRIBUTOR_RESPONSES);
  }
  // Check for power user
  else if (stats.isPowerUser) {
    intro = pickRandom(POWER_USER_RESPONSES)
      .replace('{totalPosts}', String(stats.totalPosts))
      .replace('{totalComments}', String(stats.totalComments))
      .replace('{totalActivity}', String(totalActivity))
      .replace('{timespan}', timespan);
  }
  // Standard user
  else {
    intro = pickRandom(STANDARD_RESPONSES).replace('{subreddit}', stats.subreddit);
  }

  // Build full response
  const statsTable = formatStatsTable(stats);

  return `📊 **Farewell Statistics for u/${stats.username}**

${intro}

${statsTable}${getStatsFooter()}`;
}
