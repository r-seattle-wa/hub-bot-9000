// AI Provider abstraction - BYOK (Bring Your Own Key)

import { TriggerContext, JobContext } from '@devvit/public-api';
import { AIProvider, SourceClassification, ClassificationResult } from './types.js';
import { getJson, setJson, REDIS_PREFIX } from './redis.js';
import { checkRateLimit, consumeRateLimit } from './rate-limiter.js';

// Common context type that works with both triggers and scheduler jobs
type AppContext = TriggerContext | JobContext;

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

/**
 * Classify a subreddit using the configured AI provider
 * Returns cached result if available
 */
export async function classifySubreddit(
  context: AppContext,
  subreddit: string,
  settings: {
    aiProvider: AIProvider;
    geminiApiKey?: string;
    friendlySubreddits?: string[];
    adversarialSubreddits?: string[];
    hatefulSubreddits?: string[];
  }
): Promise<ClassificationResult> {
  const subredditLower = subreddit.toLowerCase();

  // 1. Check manual lists first (always free, always wins)
  if (settings.friendlySubreddits?.map(s => s.toLowerCase()).includes(subredditLower)) {
    return { classification: SourceClassification.FRIENDLY, method: 'mod_list' };
  }
  if (settings.hatefulSubreddits?.map(s => s.toLowerCase()).includes(subredditLower)) {
    return { classification: SourceClassification.HATEFUL, method: 'mod_list' };
  }
  if (settings.adversarialSubreddits?.map(s => s.toLowerCase()).includes(subredditLower)) {
    return { classification: SourceClassification.ADVERSARIAL, method: 'mod_list' };
  }

  // 2. Check cache
  const cacheKey = `${REDIS_PREFIX.classification}${subredditLower}`;
  const cached = await getJson<ClassificationResult>(context.redis, cacheKey);
  if (cached) {
    return cached;
  }

  // 3. No AI configured? Default to neutral
  if (settings.aiProvider === AIProvider.NONE || !settings.geminiApiKey) {
    return { classification: SourceClassification.NEUTRAL, method: 'default' };
  }

  // 4. Check rate limit for AI calls
  const subredditId = (await context.reddit.getCurrentSubreddit()).id;
  const rateCheck = await checkRateLimit(context.redis, 'subGemini', subredditId);
  if (!rateCheck.allowed) {
    // Rate limited, fall back to neutral
    return { classification: SourceClassification.NEUTRAL, method: 'default' };
  }

  // 5. Call Gemini (mod pays)
  try {
    const result = await callGeminiClassification(
      context,
      subreddit,
      settings.geminiApiKey
    );

    // Cache the result
    await setJson(context.redis, cacheKey, result, CACHE_TTL_SECONDS);

    // Consume rate limit
    await consumeRateLimit(context.redis, 'subGemini', subredditId);

    return result;
  } catch (error) {
    console.error('Gemini classification failed:', error);
    return { classification: SourceClassification.NEUTRAL, method: 'default' };
  }
}

/**
 * Call Gemini Flash API for subreddit classification
 */
async function callGeminiClassification(
  context: AppContext,
  subreddit: string,
  apiKey: string
): Promise<ClassificationResult> {
  // Get subreddit info for context
  let description = '';
  let recentTitles: string[] = [];

  try {
    const subInfo = await context.reddit.getSubredditById(subreddit);
    description = subInfo?.description || '';

    // Get recent posts for context
    const posts = await context.reddit.getHotPosts({
      subredditName: subreddit,
      limit: 10,
    }).all();
    recentTitles = posts.map(p => p.title).slice(0, 5);
  } catch {
    // Subreddit might be private or banned
  }

  const prompt = `Classify this subreddit. Respond with ONLY one word: FRIENDLY, NEUTRAL, ADVERSARIAL, or HATEFUL.

r/${subreddit}
Description: ${description || 'N/A'}
Recent posts: ${recentTitles.join('; ') || 'N/A'}

Classification:`;

  // Call Gemini Flash API
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 10,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json() as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase() || '';

  // Parse response
  let classification = SourceClassification.NEUTRAL;
  if (text.includes('FRIENDLY')) classification = SourceClassification.FRIENDLY;
  else if (text.includes('HATEFUL')) classification = SourceClassification.HATEFUL;
  else if (text.includes('ADVERSARIAL')) classification = SourceClassification.ADVERSARIAL;

  return {
    classification,
    method: 'ai_analysis',
    cachedAt: Date.now(),
  };
}

/**
 * Clear classification cache for a subreddit
 * Useful when mods want to re-classify
 */
export async function clearClassificationCache(
  redis: AppContext['redis'],
  subreddit: string
): Promise<void> {
  const cacheKey = `${REDIS_PREFIX.classification}${subreddit.toLowerCase()}`;
  await redis.del(cacheKey);
}

// ============================================
// Gemini Fallback for Scraping
// ============================================

interface GeminiFetchOptions {
  geminiApiKey: string;
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Use Gemini with Google Search grounding as a fallback when direct scraping fails
 * Mod pays for API usage (BYOK model)
 */
export async function geminiSearchFallback<T>(
  query: string,
  parsePrompt: string,
  options: GeminiFetchOptions
): Promise<T | null> {
  const { geminiApiKey, temperature = 0.1, maxOutputTokens = 4096 } = options;

  if (!geminiApiKey) return null;

  const prompt = `${parsePrompt}

Search query: ${query}

Return ONLY valid JSON, no markdown code blocks or explanation.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens,
          },
          tools: [{
            google_search_retrieval: {
              dynamic_retrieval_config: { mode: 'MODE_DYNAMIC' }
            }
          }],
        }),
      }
    );

    if (!response.ok) {
      console.error(`Gemini API error: ${response.status}`);
      return null;
    }

    const data = await response.json() as GeminiResponse;
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    // Clean up markdown code blocks
    if (text.startsWith('```')) {
      text = text.split('```')[1];
      if (text.startsWith('json')) text = text.slice(4);
    }
    text = text.trim();

    if (!text) return null;

    return JSON.parse(text) as T;
  } catch (error) {
    console.error('Gemini search fallback failed:', error);
    return null;
  }
}

/**
 * Search for Reddit crosslinks using Gemini when PullPush is unavailable
 */
export async function geminiCrosslinkSearch(
  targetSubreddit: string,
  geminiApiKey: string
): Promise<Array<{
  subreddit: string;
  title: string;
  url: string;
  summary?: string;
}>> {
  if (!geminiApiKey) return [];

  const parsePrompt = `Find recent Reddit posts from OTHER subreddits that link to or mention r/${targetSubreddit}.

Return a JSON array with this format:
[
  {
    "subreddit": "SubredditName",
    "title": "Post title",
    "url": "https://reddit.com/...",
    "summary": "Brief description of why they linked"
  }
]

Only include posts from the last 7 days. Only include posts that directly link to or discuss r/${targetSubreddit}. If no posts found, return: []`;

  const results = await geminiSearchFallback<Array<{
    subreddit: string;
    title: string;
    url: string;
    summary?: string;
  }>>(
    `reddit posts linking to r/${targetSubreddit} site:reddit.com`,
    parsePrompt,
    { geminiApiKey }
  );

  return results || [];
}

// User stats come from wiki (sub-stats-bot), not AI - see wiki.ts

/**
 * Classify the TONE of a specific post title/content
 * This analyzes the linking post itself, not the subreddit
 */
export async function classifyPostTone(
  postTitle: string,
  geminiApiKey?: string,
  postBody?: string
): Promise<SourceClassification> {
  // If no API key, default to neutral
  if (!geminiApiKey) {
    return SourceClassification.NEUTRAL;
  }

  const content = postBody ? `${postTitle}\n\n${postBody}` : postTitle;

  const prompt = `Analyze the tone of this Reddit post that links to another subreddit.
Classify as ONE word: FRIENDLY, NEUTRAL, ADVERSARIAL, or HATEFUL.

- FRIENDLY: Positive sharing, appreciation, "check out this cool post"
- NEUTRAL: Informational, news sharing, discussion without strong opinion
- ADVERSARIAL: Mocking, criticism, "look at these idiots", drama-seeking
- HATEFUL: Harassment, calls to action, brigading language, slurs

Post title: "${postTitle}"
${postBody ? `Post body: "${postBody.slice(0, 500)}"` : ''}

Classification:`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 10,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error(`Gemini tone classification error: ${response.status}`);
      return SourceClassification.NEUTRAL;
    }

    const data = await response.json() as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase() || '';

    if (text.includes('FRIENDLY')) return SourceClassification.FRIENDLY;
    if (text.includes('HATEFUL')) return SourceClassification.HATEFUL;
    if (text.includes('ADVERSARIAL')) return SourceClassification.ADVERSARIAL;
    return SourceClassification.NEUTRAL;
  } catch (error) {
    console.error('Post tone classification failed:', error);
    return SourceClassification.NEUTRAL;
  }
}
