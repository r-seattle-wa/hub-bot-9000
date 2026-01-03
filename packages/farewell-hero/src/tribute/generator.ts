import { SarcasmLevel } from '@hub-bot/common';

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

interface GenerateTributeOptions {
  context: string;
  targetName: string;
  targetType: 'subreddit' | 'user';
  sarcasmLevel: SarcasmLevel;
  aiProvider: string;
  groqApiKey?: string;
  geminiApiKey?: string;
}

/**
 * Generate a satirical tribute using the configured AI provider
 */
export async function generateTribute(options: GenerateTributeOptions): Promise<string> {
  const { context, targetName, targetType, sarcasmLevel, aiProvider, groqApiKey, geminiApiKey } = options;

  const systemPrompt = getSystemPrompt(targetName, targetType, sarcasmLevel);
  const userPrompt = getUserPrompt(context, targetName, targetType);

  // Try primary provider first
  if (aiProvider === 'groq' && groqApiKey) {
    try {
      return await generateWithGroq(systemPrompt, userPrompt, groqApiKey);
    } catch (error) {
      console.error('Groq generation failed, trying fallback:', error);
    }
  }

  // Try Gemini as fallback or primary
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

function getSystemPrompt(
  targetName: string,
  targetType: 'subreddit' | 'user',
  sarcasmLevel: SarcasmLevel
): string {
  const toneGuide = TONE_GUIDES[sarcasmLevel];

  if (targetType === 'subreddit') {
    return `You are a comedic tribute generator paying homage to r/${targetName}.
Channel the essence of this subreddit and create a funny, exaggerated tribute that captures its stereotypical themes.

${toneGuide}

Generate a 2-4 sentence tribute that a longtime member would find amusingly accurate.
IMPORTANT: This is a loving tribute, not mockery.`;
  } else {
    return `You are a comedic tribute generator paying homage to Reddit user u/${targetName}.
Based on their posting history, create a funny exaggerated tribute that captures their typical topics, tone, and quirks.

${toneGuide}

Generate a 2-4 sentence tribute in their distinctive style.
IMPORTANT: This is a loving tribute to their Reddit presence, not harassment.`;
  }
}

const TONE_GUIDES: Record<SarcasmLevel, string> = {
  [SarcasmLevel.POLITE]: `TONE: Respectful and warm, like a heartfelt toast.`,
  [SarcasmLevel.NEUTRAL]: `TONE: Matter-of-fact with a wink, like a nature documentary narrator.`,
  [SarcasmLevel.SNARKY]: `TONE: Playfully teasing, like roasting a friend.`,
  [SarcasmLevel.ROAST]: `TONE: Comedy roast style - sharp but affectionate.`,
  [SarcasmLevel.FREAKOUT]: `TONE: MAXIMUM DRAMATIC ENERGY. ALL CAPS acceptable.`,
};

function getUserPrompt(context: string, targetName: string, targetType: 'subreddit' | 'user'): string {
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

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status}`);
  }

  const data = await response.json() as GroqResponse;
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('Empty response from Groq');
  }

  return content;
}

async function generateWithGemini(systemPrompt: string, userPrompt: string, apiKey: string): Promise<string> {
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 300,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json() as GeminiResponse;
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!content) {
    throw new Error('Empty response from Gemini');
  }

  return content;
}

function generateFallbackTribute(targetName: string, targetType: 'subreddit' | 'user', sarcasmLevel: SarcasmLevel): string {
  const prefix = targetType === 'subreddit' ? 'r/' : 'u/';

  const templates: Record<SarcasmLevel, string[]> = {
    [SarcasmLevel.POLITE]: [
      `The wonderful community of ${prefix}${targetName} continues to inspire us all.`,
    ],
    [SarcasmLevel.NEUTRAL]: [
      `${prefix}${targetName} exists on Reddit. Posts are made. Such is the way.`,
    ],
    [SarcasmLevel.SNARKY]: [
      `Ah yes, ${prefix}${targetName} - where every day brings new reasons to hit refresh.`,
    ],
    [SarcasmLevel.ROAST]: [
      `${prefix}${targetName} - proof that the internet was a mistake, but a hilarious one.`,
    ],
    [SarcasmLevel.FREAKOUT]: [
      `BEHOLD ${prefix}${targetName}!!! THE LEGENDS WERE TRUE!!!`,
    ],
  };

  const options = templates[sarcasmLevel];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Format the complete tribute response
 */
export function formatTributeResponse(
  tribute: string,
  targetName: string,
  targetType: 'subreddit' | 'user',
  sarcasmLevel: SarcasmLevel
): string {
  const prefix = targetType === 'subreddit' ? 'r/' : 'u/';

  const headers: Record<SarcasmLevel, string[]> = {
    [SarcasmLevel.POLITE]: [`*A heartfelt tribute to ${prefix}${targetName}:*`],
    [SarcasmLevel.NEUTRAL]: [`*Channeling the essence of ${prefix}${targetName}:*`],
    [SarcasmLevel.SNARKY]: [`*Behold! A tribute to ${prefix}${targetName}:*`],
    [SarcasmLevel.ROAST]: [`*Peak ${prefix}${targetName} energy:*`],
    [SarcasmLevel.FREAKOUT]: [`*THE SPIRIT OF ${prefix}${targetName.toUpperCase()} HAS POSSESSED ME:*`],
  };

  const header = headers[sarcasmLevel][0];

  return `${header}

${tribute}

^(AI satire | block to opt-out)`;
}

/**
 * Parse tribute command - supports both !tribute and natural language
 */
export interface TributeCommand {
  found: boolean;
  target?: string;
  targetType?: 'subreddit' | 'user';
}

export function parseTributeCommand(text: string): TributeCommand {
  // Pattern 1: !tribute command
  const commandMatch = text.match(/!tribute(?:\s+((?:r\/|u\/)?[\w-]+))?/i);
  if (commandMatch) {
    const target = commandMatch[1];
    if (!target) {
      return { found: true };
    }
    if (target.toLowerCase().startsWith('u/')) {
      return { found: true, target: target.slice(2), targetType: 'user' };
    } else if (target.toLowerCase().startsWith('r/')) {
      return { found: true, target: target.slice(2), targetType: 'subreddit' };
    } else {
      return { found: true, target, targetType: 'subreddit' };
    }
  }

  // Pattern 2: Natural language - "what would u/username say"
  const naturalMatch = text.match(/what\s+would\s+(u\/[\w-]+|r\/[\w-]+)\s+say/i);
  if (naturalMatch) {
    const target = naturalMatch[1];
    if (target.toLowerCase().startsWith('u/')) {
      return { found: true, target: target.slice(2), targetType: 'user' };
    } else {
      return { found: true, target: target.slice(2), targetType: 'subreddit' };
    }
  }

  // Pattern 3: Bot mention with target
  const mentionMatch = text.match(/(?:u\/farewell-hero|@farewell-hero)[,:]?\s+(?:what\s+would\s+)?(u\/[\w-]+|r\/[\w-]+)/i);
  if (mentionMatch) {
    const target = mentionMatch[1];
    if (target.toLowerCase().startsWith('u/')) {
      return { found: true, target: target.slice(2), targetType: 'user' };
    } else {
      return { found: true, target: target.slice(2), targetType: 'subreddit' };
    }
  }

  // Pattern 4: "channel" / "simulate"
  const tributeMatch = text.match(/(?:channel|tribute\s+to|simulate)\s+(u\/[\w-]+|r\/[\w-]+)/i);
  if (tributeMatch) {
    const target = tributeMatch[1];
    if (target.toLowerCase().startsWith('u/')) {
      return { found: true, target: target.slice(2), targetType: 'user' };
    } else {
      return { found: true, target: target.slice(2), targetType: 'subreddit' };
    }
  }

  return { found: false };
}
