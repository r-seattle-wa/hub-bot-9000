// AI Provider abstraction - BYOK (Bring Your Own Key)

import { TriggerContext, JobContext } from '@devvit/public-api';
import { AIProvider, SourceClassification, ClassificationResult, UserTone, ToneClassificationResult } from './types.js';
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

  const content = postBody ? `${postTitle}

${postBody}` : postTitle;

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


// ============================================
// User Tone Classification for farewell-hero
// ============================================

// Keyword patterns for fallback tone detection (no API key)
const TONE_KEYWORDS = {
  hostile: [
    'toxic', 'garbage', 'trash', 'hate', 'worst', 'terrible', 'awful', 'disgusting',
    'pathetic', 'moron', 'idiot', 'dumb', 'stupid', 'suck', 'cancer', 'cesspool',
    'echo chamber', 'circlejerk', 'hivemind', 'nazi', 'fascist', 'communist',
  ],
  frustrated: [
    'tired', 'sick of', 'fed up', 'enough', 'done with', 'over it', 'cant anymore',
    'annoying', 'frustrating', 'pointless', 'waste of time', 'useless', 'ridiculous',
  ],
  dramatic: [
    'forever', 'never again', 'final', 'goodbye forever', 'rip', 'dead to me',
    'worst decision', 'ruined', 'destroyed', 'devastated', 'heartbroken', 'betrayed',
    'unforgivable', 'the end', 'farewell', 'adieu', 'sayonara',
  ],
  polite: [
    'thank', 'appreciate', 'grateful', 'enjoyed', 'good luck', 'best wishes',
    'loved', 'great community', 'wonderful', 'amazing people', 'helped me',
  ],
};

/**
 * Classify the tone of an unsubscribe announcement
 * Returns tone, trigger phrase, reasoning, and confidence
 * Uses AI if available, keyword fallback if not
 */
export async function classifyUnsubscribeTone(
  text: string,
  geminiApiKey?: string
): Promise<ToneClassificationResult> {
  // Try AI classification first if API key available
  if (geminiApiKey) {
    const aiResult = await classifyUnsubscribeToneWithAI(text, geminiApiKey);
    if (aiResult) return aiResult;
  }

  // Fallback to keyword detection
  return classifyUnsubscribeToneKeywords(text);
}

/**
 * AI-powered tone classification with Gemini
 */
async function classifyUnsubscribeToneWithAI(
  text: string,
  apiKey: string
): Promise<ToneClassificationResult | null> {
  const prompt = `Analyze the tone of this Reddit comment where someone announces they are unsubscribing/leaving.

Return ONLY a JSON object (no markdown) with:
{
  "tone": "POLITE" | "NEUTRAL" | "FRUSTRATED" | "HOSTILE" | "DRAMATIC",
  "triggerPhrase": "the specific phrase that most indicates this tone",
  "reasoning": "brief 1-sentence explanation",
  "confidence": 0.0-1.0
}

Tone definitions:
- POLITE: Grateful, appreciative, wishing well, mature exit
- NEUTRAL: Matter-of-fact, no strong emotion, simple announcement
- FRUSTRATED: Annoyed, fed up, but not hostile or personal
- HOSTILE: Attacking, insulting, blaming specific people or the community
- DRAMATIC: Over-the-top emotional, theatrical, hyperbolic statements

Comment: "${text.slice(0, 1000)}"

JSON:`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 200,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error(`Gemini tone API error: ${response.status}`);
      return null;
    }

    const data = await response.json() as GeminiResponse;
    let responseText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    // Clean markdown code blocks
    if (responseText.startsWith('```')) {
      responseText = responseText.split('```')[1];
      if (responseText.startsWith('json')) responseText = responseText.slice(4);
    }
    responseText = responseText.trim();

    const parsed = JSON.parse(responseText) as {
      tone: string;
      triggerPhrase?: string;
      reasoning?: string;
      confidence?: number;
    };

    // Map string to enum
    const toneMap: Record<string, UserTone> = {
      POLITE: UserTone.POLITE,
      NEUTRAL: UserTone.NEUTRAL,
      FRUSTRATED: UserTone.FRUSTRATED,
      HOSTILE: UserTone.HOSTILE,
      DRAMATIC: UserTone.DRAMATIC,
    };

    return {
      tone: toneMap[parsed.tone] || UserTone.NEUTRAL,
      triggerPhrase: parsed.triggerPhrase,
      reasoning: parsed.reasoning,
      confidence: parsed.confidence || 0.8,
    };
  } catch (error) {
    console.error('AI tone classification failed:', error);
    return null;
  }
}

/**
 * Keyword-based tone classification (fallback when no API key)
 */
function classifyUnsubscribeToneKeywords(text: string): ToneClassificationResult {
  const textLower = text.toLowerCase();
  
  // Check each category
  const hostileMatches = findKeywordMatches(textLower, TONE_KEYWORDS.hostile);
  const frustratedMatches = findKeywordMatches(textLower, TONE_KEYWORDS.frustrated);
  const dramaticMatches = findKeywordMatches(textLower, TONE_KEYWORDS.dramatic);
  const politeMatches = findKeywordMatches(textLower, TONE_KEYWORDS.polite);

  // Calculate scores
  const scores = {
    hostile: hostileMatches.length * 2, // Weight hostile higher
    frustrated: frustratedMatches.length,
    dramatic: dramaticMatches.length * 1.5, // Weight dramatic somewhat
    polite: politeMatches.length,
  };

  // Find dominant tone
  let maxScore = 0;
  let dominantTone: UserTone = UserTone.NEUTRAL;
  let triggerPhrase: string | undefined;
  let matches: string[] = [];

  if (scores.hostile > maxScore) {
    maxScore = scores.hostile;
    dominantTone = UserTone.HOSTILE;
    matches = hostileMatches;
  }
  if (scores.frustrated > maxScore) {
    maxScore = scores.frustrated;
    dominantTone = UserTone.FRUSTRATED;
    matches = frustratedMatches;
  }
  if (scores.dramatic > maxScore) {
    maxScore = scores.dramatic;
    dominantTone = UserTone.DRAMATIC;
    matches = dramaticMatches;
  }
  if (scores.polite > maxScore) {
    maxScore = scores.polite;
    dominantTone = UserTone.POLITE;
    matches = politeMatches;
  }

  // Get trigger phrase (first match)
  triggerPhrase = matches[0];

  // Calculate confidence based on score strength
  const totalMatches = hostileMatches.length + frustratedMatches.length + 
                       dramaticMatches.length + politeMatches.length;
  const confidence = totalMatches > 0 ? Math.min(0.4 + (maxScore / 10), 0.85) : 0.3;

  return {
    tone: dominantTone,
    triggerPhrase,
    reasoning: triggerPhrase 
      ? `Keyword detected: "${triggerPhrase}"`
      : 'No strong indicators found',
    confidence,
  };
}

/**
 * Find matching keywords in text
 */
function findKeywordMatches(text: string, keywords: string[]): string[] {
  return keywords.filter(keyword => text.includes(keyword));
}

/**
 * Generate a conversational reply when user replies to the bot
 * Only generates one reply per thread to avoid conversation loops
 */
export async function generateBotReply(
  context: AppContext,
  params: {
    botName: string;
    botPersonality: string;
    originalBotComment: string;
    userReply: string;
    userUsername: string;
    geminiApiKey?: string;
  }
): Promise<string | null> {
  const { botName, botPersonality, originalBotComment, userReply, userUsername, geminiApiKey } = params;

  // Check rate limit
  const subreddit = await context.reddit.getCurrentSubreddit();
  const rateCheck = await checkRateLimit(context.redis, 'subGemini', subreddit.id);
  if (!rateCheck.allowed) {
    console.log('Rate limited for AI reply generation');
    return null;
  }

  // If no API key, return a canned response
  if (!geminiApiKey) {
    return generateCannedReply(botName, userReply);
  }

  try {
    const prompt = `You are ${botName}, a Reddit bot with the following personality: ${botPersonality}

You previously posted this comment:
"""
${originalBotComment.slice(0, 500)}
"""

User u/${userUsername} replied:
"""
${userReply.slice(0, 500)}
"""

Generate a brief, conversational reply (1-3 sentences max). Stay in character. Be helpful but not overly apologetic. If they're hostile, match their energy with wit. If they have a legitimate question, answer briefly. Do NOT start with "Hey there" or "Hello" - just reply naturally.

Reply only with the response text, no quotes or explanation.`;

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + geminiApiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 150,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error('Gemini reply API error:', response.status);
      return generateCannedReply(botName, userReply);
    }

    const data = await response.json() as GeminiResponse;
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!replyText) {
      return generateCannedReply(botName, userReply);
    }

    // Consume rate limit
    await consumeRateLimit(context.redis, 'subGemini', subreddit.id);

    return replyText;
  } catch (error) {
    console.error('Failed to generate bot reply:', error);
    return generateCannedReply(botName, userReply);
  }
}

/**
 * Generate a canned reply when AI is not available
 */
function generateCannedReply(botName: string, userReply: string): string {
  const replyLower = userReply.toLowerCase();

  // Check for common patterns
  if (replyLower.includes('?')) {
    return 'Good question! Check out the subreddit wiki for more info.';
  }
  if (replyLower.includes('thank')) {
    return "You're welcome!";
  }
  if (replyLower.includes('bot') && (replyLower.includes('bad') || replyLower.includes('stupid') || replyLower.includes('dumb'))) {
    return 'Beep boop. I do my best!';
  }
  if (replyLower.includes('good bot')) {
    return '*happy robot noises* Thanks!';
  }
  
  // Default
  return "I'm just a bot, but thanks for the feedback!";
}
