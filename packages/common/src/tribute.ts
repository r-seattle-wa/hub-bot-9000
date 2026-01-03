// Tribute generation - shared logic for satirical user/subreddit tributes
// Can be used by farewell-hero, brigade-sentinel, or any other hub-bot app

import { TriggerContext, JobContext } from '@devvit/public-api';
import { SarcasmLevel } from './types.js';

type AppContext = TriggerContext | JobContext;

// ============================================
// Context Fetching
// ============================================

const MAX_POSTS = 25;
const MAX_COMMENT_LENGTH = 300;

/**
 * Fetch context from a subreddit for tribute generation
 */
export async function fetchSubredditContext(
  context: AppContext,
  subredditName: string,
  limit: number = MAX_POSTS
): Promise<string> {
  try {
    const posts = await context.reddit.getHotPosts({
      subredditName,
      limit,
    }).all();

    const contextParts: string[] = [];

    for (const post of posts.slice(0, 15)) {
      let postText = `Title: ${post.title}`;

      if (post.body && post.body.length > 0 && post.body.length < 500) {
        postText += `\nBody: ${post.body.slice(0, 500)}`;
      }

      try {
        const comments = await context.reddit.getComments({
          postId: post.id,
          limit: 3,
          sort: 'top',
        }).all();

        const topComments = comments
          .filter(c => c.body && c.body.length < MAX_COMMENT_LENGTH && c.body !== '[deleted]')
          .slice(0, 2)
          .map(c => c.body);

        if (topComments.length > 0) {
          postText += `\nTop comments: ${topComments.join(' | ')}`;
        }
      } catch {
        // Skip comments if we can't fetch them
      }

      contextParts.push(postText);
    }

    if (contextParts.length === 0) {
      throw new Error(`No content found for r/${subredditName}`);
    }

    return contextParts.join('\n\n---\n\n');
  } catch (error) {
    console.error(`Error fetching subreddit context for r/${subredditName}:`, error);
    throw error;
  }
}

/**
 * Fetch context from a user's post history for tribute generation
 */
export async function fetchUserContext(
  context: AppContext,
  username: string,
  commentLimit: number = 30,
  postLimit: number = 10
): Promise<string> {
  const contentParts: string[] = [];

  try {
    const comments = await context.reddit.getCommentsByUser({
      username,
      limit: commentLimit,
      sort: 'new',
    }).all();

    for (const comment of comments) {
      if (comment.body && comment.body.length > 0 && comment.body !== '[deleted]') {
        contentParts.push(`[r/${comment.subredditName}] ${comment.body.slice(0, 300)}`);
      }
    }
  } catch (error) {
    console.error(`Error fetching comments for u/${username}:`, error);
  }

  try {
    const posts = await context.reddit.getPostsByUser({
      username,
      limit: postLimit,
      sort: 'new',
    }).all();

    for (const post of posts) {
      let text = `[r/${post.subredditName}] Title: ${post.title}`;
      if (post.body && post.body.length > 0) {
        text += ` - ${post.body.slice(0, 200)}`;
      }
      contentParts.push(text);
    }
  } catch (error) {
    console.error(`Error fetching posts for u/${username}:`, error);
  }

  if (contentParts.length === 0) {
    throw new Error(`No content found for u/${username}`);
  }

  return contentParts.slice(0, 20).join('\n\n');
}

// ============================================
// Tribute Generation
// ============================================

interface GroqResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export interface GenerateTributeOptions {
  context: string;
  targetName: string;
  targetType: 'subreddit' | 'user';
  sarcasmLevel: SarcasmLevel;
  groqApiKey?: string;
  geminiApiKey?: string;
}

/**
 * Generate a satirical tribute using AI
 * Tries Groq first (free tier), falls back to Gemini
 */
export async function generateTribute(options: GenerateTributeOptions): Promise<string> {
  const { context, targetName, targetType, sarcasmLevel, groqApiKey, geminiApiKey } = options;

  const systemPrompt = getTributeSystemPrompt(targetName, targetType, sarcasmLevel);
  const userPrompt = getTributeUserPrompt(context, targetName, targetType);

  // Try Groq first (free tier)
  if (groqApiKey) {
    try {
      return await generateWithGroq(systemPrompt, userPrompt, groqApiKey);
    } catch (error) {
      console.error('Groq generation failed, trying Gemini fallback:', error);
    }
  }

  // Try Gemini as fallback
  if (geminiApiKey) {
    try {
      return await generateWithGemini(systemPrompt, userPrompt, geminiApiKey);
    } catch (error) {
      console.error('Gemini generation failed:', error);
    }
  }

  // If both fail, return a canned response
  return generateFallbackTribute(targetName, targetType, sarcasmLevel);
}

const TRIBUTE_TONE_GUIDES: Record<SarcasmLevel, string> = {
  [SarcasmLevel.POLITE]: `TONE: Respectful and warm, like a heartfelt toast.`,
  [SarcasmLevel.NEUTRAL]: `TONE: Matter-of-fact with a wink, like a nature documentary narrator.`,
  [SarcasmLevel.SNARKY]: `TONE: Playfully teasing, like roasting a friend.`,
  [SarcasmLevel.ROAST]: `TONE: Comedy roast style - sharp but affectionate.`,
  [SarcasmLevel.FREAKOUT]: `TONE: MAXIMUM DRAMATIC ENERGY. ALL CAPS acceptable.`,
};

function getTributeSystemPrompt(targetName: string, targetType: 'subreddit' | 'user', sarcasmLevel: SarcasmLevel): string {
  const toneGuide = TRIBUTE_TONE_GUIDES[sarcasmLevel];

  if (targetType === 'subreddit') {
    return `You are a comedic tribute generator paying homage to r/${targetName}.
Channel the essence of this subreddit and create a funny, exaggerated tribute.

${toneGuide}

Generate 2-4 sentences. This is a LOVING tribute, not mockery.`;
  } else {
    return `You are a comedic tribute generator paying homage to u/${targetName}.
Based on their posting history, create a funny exaggerated tribute capturing their style.

${toneGuide}

Generate 2-4 sentences. This is a LOVING tribute, not harassment.`;
  }
}

function getTributeUserPrompt(context: string, targetName: string, targetType: 'subreddit' | 'user'): string {
  const prefix = targetType === 'subreddit' ? 'r/' : 'u/';
  return `Recent content from ${prefix}${targetName}:

${context.slice(0, 4000)}

Generate a short satirical tribute (2-4 sentences). Reply ONLY with the tribute text.`;
}

async function generateWithGroq(systemPrompt: string, userPrompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 300,
      temperature: 0.9,
    }),
  });

  if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
  const data = await response.json() as GroqResponse;
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Empty response from Groq');
  return content;
}

async function generateWithGemini(systemPrompt: string, userPrompt: string, apiKey: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 300 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
  const data = await response.json() as GeminiResponse;
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!content) throw new Error('Empty response from Gemini');
  return content;
}

function generateFallbackTribute(targetName: string, targetType: 'subreddit' | 'user', sarcasmLevel: SarcasmLevel): string {
  const prefix = targetType === 'subreddit' ? 'r/' : 'u/';
  const templates: Record<SarcasmLevel, string> = {
    [SarcasmLevel.POLITE]: `The wonderful ${prefix}${targetName} continues to inspire us all.`,
    [SarcasmLevel.NEUTRAL]: `${prefix}${targetName} exists. Posts are made. Such is the way.`,
    [SarcasmLevel.SNARKY]: `Ah yes, ${prefix}${targetName} - where every day brings new reasons to hit refresh.`,
    [SarcasmLevel.ROAST]: `${prefix}${targetName} - proof the internet was a mistake, but a hilarious one.`,
    [SarcasmLevel.FREAKOUT]: `BEHOLD ${prefix}${targetName}!!! THE LEGENDS WERE TRUE!!!`,
  };
  return templates[sarcasmLevel];
}

// ============================================
// Response Formatting
// ============================================

/**
 * Format a complete tribute response with header and footer
 */
export function formatTributeResponse(
  tribute: string,
  targetName: string,
  targetType: 'subreddit' | 'user',
  sarcasmLevel: SarcasmLevel
): string {
  const prefix = targetType === 'subreddit' ? 'r/' : 'u/';
  const headers: Record<SarcasmLevel, string> = {
    [SarcasmLevel.POLITE]: `*A heartfelt tribute to ${prefix}${targetName}:*`,
    [SarcasmLevel.NEUTRAL]: `*Channeling ${prefix}${targetName}:*`,
    [SarcasmLevel.SNARKY]: `*Behold! A tribute to ${prefix}${targetName}:*`,
    [SarcasmLevel.ROAST]: `*Peak ${prefix}${targetName} energy:*`,
    [SarcasmLevel.FREAKOUT]: `*THE SPIRIT OF ${prefix}${targetName.toUpperCase()} SPEAKS:*`,
  };

  return `${headers[sarcasmLevel]}

${tribute}

^(AI satire | block to opt-out)`;
}

// ============================================
// Command Parsing
// ============================================

export interface TributeCommand {
  found: boolean;
  target?: string;
  targetType?: 'subreddit' | 'user';
}

/**
 * Parse tribute command from text
 * Supports: !tribute, "what would [target] say", bot mentions, "channel [target]"
 */
export function parseTributeCommand(text: string, botUsername?: string): TributeCommand {
  // Pattern 1: !tribute command
  const commandMatch = text.match(/!tribute(?:\s+((?:r\/|u\/)?[\w-]+))?/i);
  if (commandMatch) {
    const target = commandMatch[1];
    if (!target) return { found: true };
    if (target.toLowerCase().startsWith('u/')) {
      return { found: true, target: target.slice(2), targetType: 'user' };
    } else if (target.toLowerCase().startsWith('r/')) {
      return { found: true, target: target.slice(2), targetType: 'subreddit' };
    }
    return { found: true, target, targetType: 'subreddit' };
  }

  // Pattern 2: "what would [target] say"
  const naturalMatch = text.match(/what\s+would\s+(u\/[\w-]+|r\/[\w-]+)\s+say/i);
  if (naturalMatch) {
    const target = naturalMatch[1];
    return {
      found: true,
      target: target.slice(2),
      targetType: target.toLowerCase().startsWith('u/') ? 'user' : 'subreddit',
    };
  }

  // Pattern 3: Bot mention with target
  const botPattern = botUsername
    ? new RegExp(`(?:u\\/${botUsername}|@${botUsername})[,:]?\\s+(?:what\\s+would\\s+)?(u\\/[\\w-]+|r\\/[\\w-]+)`, 'i')
    : /(?:u\/farewell-hero|u\/brigade-sentinel|@farewell-hero|@brigade-sentinel)[,:]?\s+(?:what\s+would\s+)?(u\/[\w-]+|r\/[\w-]+)/i;

  const mentionMatch = text.match(botPattern);
  if (mentionMatch) {
    const target = mentionMatch[1];
    return {
      found: true,
      target: target.slice(2),
      targetType: target.toLowerCase().startsWith('u/') ? 'user' : 'subreddit',
    };
  }

  // Pattern 4: "channel" / "simulate" / "tribute to"
  const tributeMatch = text.match(/(?:channel|tribute\s+to|simulate)\s+(u\/[\w-]+|r\/[\w-]+)/i);
  if (tributeMatch) {
    const target = tributeMatch[1];
    return {
      found: true,
      target: target.slice(2),
      targetType: target.toLowerCase().startsWith('u/') ? 'user' : 'subreddit',
    };
  }

  return { found: false };
}
