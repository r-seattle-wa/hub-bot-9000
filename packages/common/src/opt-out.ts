// Wiki-based opt-out storage (shared across all hub-bot apps)

import { TriggerContext, JobContext } from '@devvit/public-api';

type AppContext = TriggerContext | JobContext;

const WIKI_PAGE = 'hub-bot-9000/opt-out';

interface OptOutData {
  users: string[];
  updatedAt: number;
}

/**
 * Check if user has opted out (stored in subreddit wiki)
 */
export async function isUserOptedOut(
  context: AppContext,
  username: string
): Promise<boolean> {
  try {
    const subredditName = await context.reddit.getCurrentSubredditName();
    const wikiPage = await context.reddit.getWikiPage(subredditName, WIKI_PAGE);

    if (!wikiPage?.content) return false;

    const data = JSON.parse(wikiPage.content) as OptOutData;
    return data.users.map(u => u.toLowerCase()).includes(username.toLowerCase());
  } catch {
    // Wiki page doesn't exist or parse error - user not opted out
    return false;
  }
}

/**
 * Add user to opt-out list
 */
export async function addOptOut(
  context: AppContext,
  username: string
): Promise<void> {
  const subredditName = await context.reddit.getCurrentSubredditName();

  let data: OptOutData = { users: [], updatedAt: Date.now() };

  try {
    const wikiPage = await context.reddit.getWikiPage(subredditName, WIKI_PAGE);
    if (wikiPage?.content) {
      data = JSON.parse(wikiPage.content) as OptOutData;
    }
  } catch {
    // Page doesn't exist, will create
  }

  const userLower = username.toLowerCase();
  if (!data.users.map(u => u.toLowerCase()).includes(userLower)) {
    data.users.push(username);
    data.updatedAt = Date.now();
  }

  const content = JSON.stringify(data, null, 2);

  try {
    await context.reddit.updateWikiPage({
      subredditName,
      page: WIKI_PAGE,
      content,
    });
  } catch {
    // Page doesn't exist, create it
    await context.reddit.createWikiPage({
      subredditName,
      page: WIKI_PAGE,
      content,
    });
  }
}

/**
 * Remove user from opt-out list
 */
export async function removeOptOut(
  context: AppContext,
  username: string
): Promise<void> {
  const subredditName = await context.reddit.getCurrentSubredditName();

  try {
    const wikiPage = await context.reddit.getWikiPage(subredditName, WIKI_PAGE);
    if (!wikiPage?.content) return;

    const data = JSON.parse(wikiPage.content) as OptOutData;
    const userLower = username.toLowerCase();
    data.users = data.users.filter(u => u.toLowerCase() !== userLower);
    data.updatedAt = Date.now();

    await context.reddit.updateWikiPage({
      subredditName,
      page: WIKI_PAGE,
      content: JSON.stringify(data, null, 2),
    });
  } catch {
    // Ignore errors
  }
}
