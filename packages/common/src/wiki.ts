// Wiki integration helpers for reading sub-stats-bot data

import { TriggerContext } from '@devvit/public-api';

/**
 * Wiki page paths for sub-stats-bot
 */
export const WIKI_PATHS = {
  summary: 'sub-stats-bot',
  year: (year: number) => `sub-stats-bot/${year}`,
};

/**
 * Check if username appears in a wiki page's top contributor lists
 */
export function isUsernameInTopList(wikiContent: string, username: string): boolean {
  // sub-stats-bot formats as: **{count} posts** from {username}
  // or with user tags: **{count} posts** from /u/{username}
  const patterns = [
    new RegExp(`from\\s+${escapeRegex(username)}\\b`, 'i'),
    new RegExp(`from\\s+/u/${escapeRegex(username)}\\b`, 'i'),
    new RegExp(`from\\s+u/${escapeRegex(username)}\\b`, 'i'),
  ];

  return patterns.some((pattern) => pattern.test(wikiContent));
}

/**
 * Extract subscriber count from wiki summary page
 */
export function extractSubscriberCount(wikiContent: string): number | null {
  // Look for "Subscribers are now X" or "X subscribers"
  const patterns = [
    /Subscribers are now ([\d,]+)/i,
    /(\d[\d,]*)\s+subscribers/i,
  ];

  for (const pattern of patterns) {
    const match = wikiContent.match(pattern);
    if (match) {
      return parseInt(match[1].replace(/,/g, ''), 10);
    }
  }
  return null;
}

/**
 * Check if user was ever a notable contributor (appeared in top lists)
 * by scanning available wiki pages
 */
export async function checkNotableContributor(
  context: TriggerContext,
  username: string,
  subredditName: string
): Promise<{ isNotable: boolean; years: number[] }> {
  const notableYears: number[] = [];
  const currentYear = new Date().getFullYear();

  // Check last 3 years of wiki pages
  for (let year = currentYear; year >= currentYear - 2; year--) {
    try {
      const wikiPage = await context.reddit.getWikiPage(
        subredditName,
        WIKI_PATHS.year(year)
      );

      if (wikiPage && wikiPage.content && isUsernameInTopList(wikiPage.content, username)) {
        notableYears.push(year);
      }
    } catch {
      // Wiki page may not exist, skip
    }
  }

  return {
    isNotable: notableYears.length > 0,
    years: notableYears,
  };
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
