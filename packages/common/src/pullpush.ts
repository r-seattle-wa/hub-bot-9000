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


// ============================================
// Scraper Service Fallback Configuration
// ============================================

interface ScraperFallbackConfig {
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
}

// Default configuration (disabled)
let scraperConfig: ScraperFallbackConfig = {
  baseUrl: '',
  apiKey: undefined,
  enabled: false,
};

/**
 * Configure the scraper fallback service
 * Call this at app startup to enable fallback when PullPush is unavailable
 */
export function configureScraperFallback(config: {
  baseUrl: string;
  apiKey?: string;
}): void {
  scraperConfig = {
    baseUrl: config.baseUrl.replace(/\/$/, ''), // Remove trailing slash
    apiKey: config.apiKey,
    enabled: true,
  };
  console.log('[pullpush] Scraper fallback configured:', config.baseUrl);
}

/**
 * Search for submissions with fallback to scraper service
 * Tries PullPush first, falls back to scraper if configured and PullPush returns empty
 */
export async function searchSubmissionsWithFallback(params: {
  subreddit?: string;
  author?: string;
  q?: string;
  after?: number;
  before?: number;
  limit?: number;
}, useScraperFallback?: boolean): Promise<PullPushSubmission[]> {
  // Try PullPush first
  const pullpushResults = await searchSubmissions(params);
  
  if (pullpushResults.length > 0) {
    return pullpushResults;
  }

  // Fallback to scraper if enabled and requested
  if (!useScraperFallback || !scraperConfig.enabled) {
    return [];
  }

  console.log('[pullpush] PullPush returned empty, trying scraper fallback');
  
  try {
    const scraperParams = new URLSearchParams();
    if (params.subreddit) scraperParams.set('subreddit', params.subreddit);
    if (params.author) scraperParams.set('author', params.author);
    if (params.q) scraperParams.set('q', params.q);
    if (params.after) scraperParams.set('after', String(params.after));
    if (params.before) scraperParams.set('before', String(params.before));
    scraperParams.set('limit', String(params.limit || 50));

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (scraperConfig.apiKey) {
      headers['X-API-Key'] = scraperConfig.apiKey;
    }

    const response = await fetch(
      `${scraperConfig.baseUrl}/reddit/submissions?${scraperParams.toString()}`,
      { headers }
    );

    if (!response.ok) {
      console.error('[pullpush] Scraper fallback error:', response.status);
      return [];
    }

    const data = await response.json() as { data: PullPushSubmission[] };
    return data.data || [];
  } catch (error) {
    console.error('[pullpush] Scraper fallback failed:', error);
    return [];
  }
}

/**
 * Find crosslinks with fallback to scraper service
 */
export async function findCrosslinksWithFallback(
  targetSubreddit: string,
  options?: { limit?: number; after?: number; useScraperFallback?: boolean }
): Promise<Array<{
  id: string;
  subreddit: string;
  title: string;
  url: string;
  permalink: string;
  created_utc: number;
  author: string;
}>> {
  // Try standard findCrosslinks first
  const posts = await searchSubmissionsWithFallback(
    {
      q: `reddit.com/r/${targetSubreddit}`,
      limit: options?.limit || 50,
      after: options?.after,
    },
    options?.useScraperFallback
  );

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



// ============================================
// Combined Crosslink Detection
// ============================================

import { TriggerContext, JobContext } from '@devvit/public-api';

/**
 * Combined crosslink detection with fallbacks
 * Tries: PullPush -> Gemini AI (Reddit native search not available in Devvit)
 */
export async function findCrosslinksWithAllFallbacks(
  context: TriggerContext | JobContext,
  targetSubreddit: string,
  options?: {
    limit?: number;
    after?: number;
    geminiApiKey?: string;
  }
): Promise<Array<{
  id: string;
  subreddit: string;
  title: string;
  url: string;
  permalink: string;
  author: string;
  source: 'pullpush' | 'gemini';
}>> {
  const limit = options?.limit || 25;
  
  // 1. Try PullPush first (best data quality)
  const pullpushResults = await findCrosslinks(targetSubreddit, { limit, after: options?.after });
  if (pullpushResults.length > 0) {
    console.log(`[crosslinks] Using PullPush: ${pullpushResults.length} results`);
    return pullpushResults.map(r => ({
      ...r,
      source: 'pullpush' as const,
    }));
  }

  // 2. Fall back to Gemini AI search (if API key provided)
  if (options?.geminiApiKey) {
    const { geminiCrosslinkSearch } = await import('./ai-provider.js');
    const geminiResults = await geminiCrosslinkSearch(targetSubreddit, options.geminiApiKey);
    if (geminiResults.length > 0) {
      console.log(`[crosslinks] Using Gemini: ${geminiResults.length} results`);
      return geminiResults.map(r => ({
        id: `gemini_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        subreddit: r.subreddit,
        title: r.title,
        url: r.url,
        permalink: r.url,
        author: 'unknown',
        source: 'gemini' as const,
      }));
    }
  }

  console.log('[crosslinks] No results from any source');
  return [];
}
