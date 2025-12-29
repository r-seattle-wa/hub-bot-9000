// Achievement Roast Generation
// AI-powered personalized roasts for hater achievements

import { TriggerContext, JobContext } from '@devvit/public-api';
import { checkRateLimit, consumeRateLimit } from './rate-limiter.js';

type AppContext = TriggerContext | JobContext;

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

export interface AchievementRoastParams {
  username: string;
  achievementName: string;
  achievementTier: string;
  achievementDescription: string;
  baseRoastTemplate: string;
  leaderboardPosition: number;
  totalScore: number;
  behaviorSummary?: string;       // From OSINT analysis
  repeatedMemes?: string[];       // Detected talking points
  homeSubreddits?: string[];      // Where they post from
  worstTitle?: string;            // Their most hostile post title
  geminiApiKey: string;
}

export interface AchievementRoastResult {
  roastText: string;
  imagePrompt: string;
  wikiLinks: Array<{ text: string; url: string }>;
  flavorText: string;             // Short tagline for the achievement
}

/**
 * Generate a personalized, contextual roast for an achievement unlock
 * Uses AI to create unique, witty commentary based on the hater's behavior
 */
export async function generateAchievementRoast(
  context: AppContext,
  params: AchievementRoastParams
): Promise<AchievementRoastResult> {
  const {
    username,
    achievementName,
    achievementTier,
    achievementDescription,
    baseRoastTemplate,
    leaderboardPosition,
    totalScore,
    behaviorSummary,
    repeatedMemes,
    homeSubreddits,
    worstTitle,
    geminiApiKey,
  } = params;

  // Check rate limit
  const subreddit = await context.reddit.getCurrentSubreddit();
  const rateCheck = await checkRateLimit(context.redis, 'subGemini', subreddit.id);

  if (!rateCheck.allowed || !geminiApiKey) {
    // Fallback to template-based roast
    return generateTemplateRoast(params);
  }

  try {
    const behaviorLine = behaviorSummary ? `- Behavior Summary: ${behaviorSummary}` : '';
    const memesLine = repeatedMemes?.length ? `- Favorite Talking Points: ${repeatedMemes.join(', ')}` : '';
    const subsLine = homeSubreddits?.length ? `- Posts From: ${homeSubreddits.slice(0, 3).join(', ')}` : '';
    const worstLine = worstTitle ? `- Most Hostile Post: "${worstTitle}"` : '';

    const prompt = `You are a sarcastic but not mean-spirited bot that awards "achievements" to dedicated haters on a subreddit. Your style is like Xbox achievement unlocks meets comedy roast.

ACHIEVEMENT INFO:
- Name: "${achievementName}" (${achievementTier} tier)
- Description: ${achievementDescription}
- Base template: "${baseRoastTemplate}"

HATER PROFILE:
- Username: u/${username}
- Leaderboard Position: #${leaderboardPosition > 0 ? leaderboardPosition : 'unranked'}
- Total Salt Points: ${totalScore}
${behaviorLine}
${memesLine}
${subsLine}
${worstLine}

Generate a JSON response with:
{
  "roastText": "A 2-3 sentence personalized roast that's funny but not cruel. Reference specific details from their profile. Keep the Xbox achievement vibe.",
  "flavorText": "A short tagline (5-10 words) like 'Truly committed to the cause' or 'The salt must flow'",
  "imagePromptEnhancement": "2-3 extra details to add to the image prompt to make it more specific to this user's behavior"
}

Be witty, reference gaming/internet culture, but avoid being actually hurtful. The goal is to be amusing to everyone, including the person receiving it.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.9, // Higher for creativity
            maxOutputTokens: 300,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error('Gemini roast API error:', response.status);
      return generateTemplateRoast(params);
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
      roastText: string;
      flavorText: string;
      imagePromptEnhancement?: string;
    };

    // Consume rate limit
    await consumeRateLimit(context.redis, 'subGemini', subreddit.id);

    // Generate wiki links based on detected memes
    const wikiLinks: Array<{ text: string; url: string }> = [];
    if (repeatedMemes?.length) {
      // Add relevant wiki links (these would be dynamically determined)
      wikiLinks.push({
        text: 'Our community demographics',
        url: `/r/${subreddit.name}/wiki/demographics`,
      });
    }

    return {
      roastText: parsed.roastText || baseRoastTemplate,
      flavorText: parsed.flavorText || 'Achievement unlocked!',
      imagePrompt: parsed.imagePromptEnhancement
        ? `${baseRoastTemplate} ${parsed.imagePromptEnhancement}`
        : baseRoastTemplate,
      wikiLinks,
    };
  } catch (error) {
    console.error('Failed to generate achievement roast:', error);
    return generateTemplateRoast(params);
  }
}

/**
 * Generate a template-based roast when AI is not available
 */
function generateTemplateRoast(params: AchievementRoastParams): AchievementRoastResult {
  const { baseRoastTemplate, leaderboardPosition, repeatedMemes } = params;

  // Build a simple but personalized message
  let roast = baseRoastTemplate;

  if (leaderboardPosition > 0 && leaderboardPosition <= 10) {
    roast += ` You're currently #${leaderboardPosition} on our leaderboard.`;
  }

  if (repeatedMemes?.length) {
    roast += ` We've noticed you really enjoy the "${repeatedMemes[0]}" talking point.`;
  }

  const flavorTexts = [
    'Truly dedicated to the cause.',
    'The salt must flow.',
    'A true professional.',
    'Your commitment is noted.',
    'The leaderboard trembles.',
  ];

  return {
    roastText: roast,
    flavorText: flavorTexts[Math.floor(Math.random() * flavorTexts.length)],
    imagePrompt: '', // Use default from achievement
    wikiLinks: [],
  };
}

/**
 * Generate an image for an achievement using Gemini Imagen
 * Returns the generated image URL or null if generation fails
 */
export async function generateAchievementImage(
  imagePrompt: string,
  achievementName: string,
  tier: string
): Promise<string | null> {
  // This function would integrate with Gemini Imagen or another image service
  // For now, return null to use fallback (no image)
  // The actual implementation would call the MCP image generation tool

  // Enhanced prompt for better image generation
  const fullPrompt = `Gaming achievement badge, ${tier} tier, "${achievementName}": ${imagePrompt}. Digital art style, clean design, suitable for a Reddit comment.`;

  console.log(`[Achievement Image] Would generate: ${fullPrompt}`);

  // TODO: Integrate with mcp__gemini-image__generate_image
  // For now, return null - images will be added when we integrate the MCP tool
  return null;
}
