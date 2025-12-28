// PullPush.io integration for Reddit content archival
// Used for deleted content recovery and crosslink detection

import { rateLimitedFetch, FetchResult } from './http.js';

const PULLPUSH_BASE = 'https://api.pullpush.io';

export interface PullPushComment {
  id: string;
  author: string;
  body: string;
  created_utc: number;
  link_id: string;
  subreddit: string;
  parent_id?: string;
  score?: number;
}

export interface PullPushSubmission {
  id: string;
  author: string;
  title: string;
  selftext?: string;
  url?: string;
  permalink: string;
  created_utc: number;
  subreddit: string;
  score?: number;
  num_comments?: number;
}

interface PullPushResponse<T> {
  data: T[];
}

/**
 * Search for comments by various criteria
 */
export async function searchComments(params: {
  linkId?: string;       // Post ID (without t3_ prefix)
  author?: string;       // Username
  subreddit?: string;    // Subreddit name
  q?: string;            // Search query
  after?: number;        // Unix timestamp
  before?: number;       // Unix timestamp
  limit?: number;        // Max results (default 100)
}): Promise<PullPushComment[]> {
  const searchParams = new URLSearchParams();

  if (params.linkId) searchParams.set('link_id', params.linkId.replace(/^t3_/, ''));
  if (params.author) searchParams.set('author', params.author);
  if (params.subreddit) searchParams.set('subreddit', params.subreddit);
  if (params.q) searchParams.set('q', params.q);
  if (params.after) searchParams.set('after', String(params.after));
  if (params.before) searchParams.set('before', String(params.before));
  searchParams.set('limit', String(params.limit || 100));

  const url = `${PULLPUSH_BASE}/reddit/search/comment/?${searchParams.toString()}`;
  const result = await rateLimitedFetch<PullPushResponse<PullPushComment>>(url);

  return result.ok && result.data ? result.data.data || [] : [];
}

/**
 * Search for submissions (posts) by various criteria
 */
export async function searchSubmissions(params: {
  subreddit?: string;    // Subreddit name
  author?: string;       // Username
  q?: string;            // Search query (searches title, selftext, url)
  after?: number;        // Unix timestamp
  before?: number;       // Unix timestamp
  limit?: number;        // Max results (default 50)
}): Promise<PullPushSubmission[]> {
  const searchParams = new URLSearchParams();

  if (params.subreddit) searchParams.set('subreddit', params.subreddit);
  if (params.author) searchParams.set('author', params.author);
  if (params.q) searchParams.set('q', params.q);
  if (params.after) searchParams.set('after', String(params.after));
  if (params.before) searchParams.set('before', String(params.before));
  searchParams.set('limit', String(params.limit || 50));

  const url = `${PULLPUSH_BASE}/reddit/search/submission/?${searchParams.toString()}`;
  const result = await rateLimitedFetch<PullPushResponse<PullPushSubmission>>(url);

  return result.ok && result.data ? result.data.data || [] : [];
}

/**
 * Get deleted comments for a specific post
 */
export async function getDeletedComments(
  postId: string,
  options?: { limit?: number; after?: number }
): Promise<PullPushComment[]> {
  return searchComments({
    linkId: postId,
    limit: options?.limit || 100,
    after: options?.after,
  });
}

/**
 * Find posts that link to a specific subreddit
 * This searches for posts containing URLs to reddit.com/r/{subreddit}
 */
export async function findCrosslinks(
  targetSubreddit: string,
  options?: { limit?: number; after?: number }
): Promise<Array<{
  id: string;
  subreddit: string;
  title: string;
  url: string;
  permalink: string;
  created_utc: number;
  author: string;
}>> {
  // Search for posts that mention the target subreddit in URL
  const posts = await searchSubmissions({
    q: `reddit.com/r/${targetSubreddit}`,
    limit: options?.limit || 50,
    after: options?.after,
  });

  return posts.map(post => ({
    id: post.id,
    subreddit: post.subreddit,
    title: post.title,
    url: post.url || `https://reddit.com${post.permalink}`,
    permalink: `https://reddit.com${post.permalink}`,
    created_utc: post.created_utc,
    author: post.author,
  }));
}

/**
 * Get a user's comment history in a specific subreddit
 */
export async function getUserCommentsInSubreddit(
  username: string,
  subreddit: string,
  options?: { limit?: number; after?: number }
): Promise<PullPushComment[]> {
  return searchComments({
    author: username,
    subreddit,
    limit: options?.limit || 100,
    after: options?.after,
  });
}

/**
 * Get a user's post history in a specific subreddit
 */
export async function getUserPostsInSubreddit(
  username: string,
  subreddit: string,
  options?: { limit?: number; after?: number }
): Promise<PullPushSubmission[]> {
  return searchSubmissions({
    author: username,
    subreddit,
    limit: options?.limit || 100,
    after: options?.after,
  });
}

/**
 * Compare archived comments with current to find deleted ones
 */
export async function findDeletedInThread(
  postId: string,
  currentCommentIds: Set<string>,
  afterTimestamp?: number
): Promise<PullPushComment[]> {
  const archivedComments = await getDeletedComments(postId, { after: afterTimestamp });

  // Filter to only comments that are no longer present (deleted/removed)
  return archivedComments.filter(
    c => !currentCommentIds.has(c.id) &&
        c.body !== '[deleted]' &&
        c.body !== '[removed]'
  );
}
