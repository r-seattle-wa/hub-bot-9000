// User Analysis Service
// Analyzes PUBLIC Reddit activity for behavior patterns
// NOTE: Per Reddit policy, we do NOT derive sensitive characteristics
// (health, politics, sexual orientation, etc.)

import { TriggerContext, JobContext } from '@devvit/public-api';
import { searchComments, searchSubmissions } from './pullpush.js';

type AppContext = TriggerContext | JobContext;

export interface UserAnalysis {
  username: string;
  analyzedAt: number;

  // Basic Reddit stats
  accountAge?: string;
  totalKarma?: number;
  linkKarma?: number;
  commentKarma?: number;

  // Activity patterns (from PullPush)
  recentActivitySubs?: string[];      // Where they've been active recently
  postFrequency?: 'inactive' | 'low' | 'moderate' | 'high' | 'very_high';
  accountFlags?: string[];            // e.g., 'new_account', 'low_karma', 'high_activity'

  // Behavior analysis (Gemini, if enabled)
  behaviorSummary?: string;           // Brief AI summary of public behavior
  engagementStyle?: 'constructive' | 'neutral' | 'confrontational' | 'unknown';

  // Behavioral profile (The-Profiler style, if deep analysis enabled)
  behavioralProfile?: BehavioralProfile;
}

// Adapted from The-Profiler's FBI-style analysis framework
// Only analyzes PUBLIC communication patterns - NO sensitive attribute inference
export interface BehavioralProfile {
  // Big Five OCEAN traits (communication style indicators only)
  ocean?: {
    openness: 'low' | 'moderate' | 'high';       // Curiosity, creativity in discussion
    conscientiousness: 'low' | 'moderate' | 'high'; // Thoroughness, attention to detail
    extraversion: 'low' | 'moderate' | 'high';   // Engagement frequency, social seeking
    agreeableness: 'low' | 'moderate' | 'high';  // Cooperativeness, conflict avoidance
    neuroticism: 'low' | 'moderate' | 'high';    // Emotional reactivity in posts
  };

  // Communication patterns
  communicationStyle?: {
    verbosity: 'terse' | 'moderate' | 'verbose';
    formality: 'casual' | 'mixed' | 'formal';
    emotionalTone: 'negative' | 'neutral' | 'positive' | 'volatile';
    argumentationStyle: 'evidence-based' | 'opinion-based' | 'emotional' | 'mixed';
  };

  // Behavioral indicators (for moderation context)
  moderationRisk?: {
    trollingLikelihood: 'low' | 'moderate' | 'high';
    deceptionIndicators: number;  // Count of inconsistencies found
    brigadingPattern: boolean;    // Pattern of cross-sub conflict
    sockpuppetRisk: 'low' | 'moderate' | 'high';
  };

  // Analysis confidence
  confidence: 'low' | 'moderate' | 'high';
  sampleSize: number;  // Number of posts/comments analyzed
}

/**
 * Analyze a Reddit user's public activity
 */
export async function analyzeUser(
  context: AppContext,
  username: string,
  options?: {
    geminiApiKey?: string;
    includeRecentPosts?: boolean;
    deepBehavioralAnalysis?: boolean;  // Enable The-Profiler style analysis
  }
): Promise<UserAnalysis> {
  const analysis: UserAnalysis = {
    username,
    analyzedAt: Date.now(),
    accountFlags: [],
  };

  // Get basic Reddit info
  try {
    const user = await context.reddit.getUserByUsername(username);
    if (user) {
      analysis.linkKarma = user.linkKarma || 0;
      analysis.commentKarma = user.commentKarma || 0;
      analysis.totalKarma = analysis.linkKarma + analysis.commentKarma;

      // Calculate account age
      const createdAt = user.createdAt;
      if (createdAt) {
        const ageMs = Date.now() - createdAt.getTime();
        const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        if (ageDays < 30) {
          analysis.accountAge = `${ageDays} days`;
          analysis.accountFlags?.push('new_account');
        } else if (ageDays < 365) {
          analysis.accountAge = `${Math.floor(ageDays / 30)} months`;
        } else {
          analysis.accountAge = `${Math.floor(ageDays / 365)} years`;
        }
      }

      // Flag low karma accounts
      if (analysis.totalKarma < 100) {
        analysis.accountFlags?.push('low_karma');
      }
    }
  } catch {
    // User might be deleted/suspended
  }

  // Get recent activity from PullPush
  if (options?.includeRecentPosts) {
    try {
      const recentComments = await searchComments({
        author: username,
        limit: 50,
        after: Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000), // Last 30 days
      });

      // Extract unique subreddits
      const subs = new Set(recentComments.map(c => c.subreddit));
      analysis.recentActivitySubs = Array.from(subs).slice(0, 10);

      // Determine post frequency
      const count = recentComments.length;
      if (count === 0) analysis.postFrequency = 'inactive';
      else if (count < 10) analysis.postFrequency = 'low';
      else if (count < 30) analysis.postFrequency = 'moderate';
      else if (count < 50) analysis.postFrequency = 'high';
      else analysis.postFrequency = 'very_high';

      if (analysis.postFrequency === 'very_high') {
        analysis.accountFlags?.push('high_activity');
      }
    } catch {
      // PullPush unavailable
    }
  }

  // Optional: Gemini behavior analysis
  if (options?.geminiApiKey) {
    try {
      const behaviorResult = await analyzeUserBehaviorWithGemini(
        username,
        options.geminiApiKey
      );
      if (behaviorResult) {
        analysis.behaviorSummary = behaviorResult.summary;
        analysis.engagementStyle = behaviorResult.style;
      }
    } catch {
      // Gemini unavailable
    }

    // Deep behavioral analysis (The-Profiler style)
    if (options.deepBehavioralAnalysis) {
      try {
        // Get more content for deep analysis including deleted posts
        const recentComments = await searchComments({
          author: username,
          limit: 100,
        });

        const recentSubmissions = await searchSubmissions({
          author: username,
          limit: 50,
        });

        // Combine content for analysis
        const allContent = [
          ...recentComments.map(c => c.body),
          ...recentSubmissions.map(s => `${s.title} ${s.selftext || ''}`),
        ].filter(Boolean);

        if (allContent.length >= 5) {
          const profile = await deepBehavioralAnalysis(
            username,
            allContent,
            options.geminiApiKey
          );
          if (profile) {
            analysis.behavioralProfile = profile;
          }
        }
      } catch {
        // Deep analysis failed
      }
    }
  }

  return analysis;
}

/**
 * Use Gemini to analyze user's public behavior patterns
 * NOTE: Only analyzes PUBLIC posts/comments, no private data
 */
async function analyzeUserBehaviorWithGemini(
  username: string,
  geminiApiKey: string
): Promise<{ summary: string; style: UserAnalysis['engagementStyle'] } | null> {
  // Get recent public posts/comments via search
  const prompt = `Analyze the PUBLIC Reddit activity of u/${username}.

Based on their recent public posts and comments, provide:
1. A brief (1-2 sentence) summary of their typical engagement style
2. Classify their engagement as: constructive, neutral, or confrontational

IMPORTANT: Only analyze PUBLIC behavior. Do NOT infer personal characteristics like health, politics, religion, or sexual orientation.

Return JSON only:
{
  "summary": "Brief behavior summary",
  "style": "constructive" | "neutral" | "confrontational"
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
          tools: [{
            google_search_retrieval: {
              dynamic_retrieval_config: { mode: 'MODE_DYNAMIC' }
            }
          }],
        }),
      }
    );

    if (!response.ok) return null;

    interface GeminiResponse {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }

    const data = await response.json() as GeminiResponse;
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    // Clean markdown
    if (text.startsWith('```')) {
      text = text.split('```')[1];
      if (text.startsWith('json')) text = text.slice(4);
    }
    text = text.trim();

    const result = JSON.parse(text) as { summary: string; style: string };
    return {
      summary: result.summary?.slice(0, 200) || 'Unknown',
      style: (['constructive', 'neutral', 'confrontational'].includes(result.style)
        ? result.style
        : 'unknown') as UserAnalysis['engagementStyle'],
    };
  } catch {
    return null;
  }
}

/**
 * Deep behavioral analysis using The-Profiler framework
 * Analyzes communication patterns for moderation insight
 *
 * IMPORTANT: This only analyzes PUBLIC posts/comments.
 * Does NOT infer sensitive characteristics (health, politics, religion, etc.)
 */
async function deepBehavioralAnalysis(
  username: string,
  contentSamples: string[],
  geminiApiKey: string
): Promise<BehavioralProfile | null> {
  const sampleSize = contentSamples.length;
  const contentPreview = contentSamples.slice(0, 20).join('\n---\n').slice(0, 8000);

  const prompt = `You are analyzing PUBLIC Reddit posts/comments for moderation insight.
Analyze the COMMUNICATION PATTERNS of u/${username} based on these ${sampleSize} samples.

SAMPLES:
${contentPreview}

Provide a behavioral profile focusing ONLY on communication style, NOT personal characteristics.
Do NOT infer: health status, political views, religion, sexual orientation, ethnicity, or location.

Return JSON only:
{
  "ocean": {
    "openness": "low|moderate|high",
    "conscientiousness": "low|moderate|high",
    "extraversion": "low|moderate|high",
    "agreeableness": "low|moderate|high",
    "neuroticism": "low|moderate|high"
  },
  "communicationStyle": {
    "verbosity": "terse|moderate|verbose",
    "formality": "casual|mixed|formal",
    "emotionalTone": "negative|neutral|positive|volatile",
    "argumentationStyle": "evidence-based|opinion-based|emotional|mixed"
  },
  "moderationRisk": {
    "trollingLikelihood": "low|moderate|high",
    "deceptionIndicators": 0,
    "brigadingPattern": false,
    "sockpuppetRisk": "low|moderate|high"
  },
  "confidence": "low|moderate|high"
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
        }),
      }
    );

    if (!response.ok) return null;

    interface GeminiResponse {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }

    const data = await response.json() as GeminiResponse;
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    // Clean markdown
    if (text.startsWith('```')) {
      text = text.split('```')[1];
      if (text.startsWith('json')) text = text.slice(4);
    }
    text = text.trim();

    const result = JSON.parse(text) as Omit<BehavioralProfile, 'sampleSize'>;
    return {
      ...result,
      sampleSize,
    };
  } catch {
    return null;
  }
}

/**
 * Get deleted content from a user via PullPush (OSINT)
 * Useful for finding content they tried to hide
 */
export async function getDeletedUserContent(
  username: string,
  options?: { limit?: number }
): Promise<{
  deletedComments: Array<{ body: string; subreddit: string; created_utc: number }>;
  deletedSubmissions: Array<{ title: string; selftext?: string; subreddit: string; created_utc: number }>;
}> {
  const limit = options?.limit || 100;

  try {
    // Search for ALL content from user (PullPush includes deleted)
    const [comments, submissions] = await Promise.all([
      searchComments({ author: username, limit }),
      searchSubmissions({ author: username, limit }),
    ]);

    // Filter to likely deleted content (body = [deleted] or [removed] by Reddit,
    // but PullPush has the original text)
    const deletedComments = comments.filter(c =>
      c.body && c.body !== '[deleted]' && c.body !== '[removed]'
    ).map(c => ({
      body: c.body,
      subreddit: c.subreddit,
      created_utc: c.created_utc,
    }));

    const deletedSubmissions = submissions.filter(s =>
      s.title && s.selftext !== '[deleted]' && s.selftext !== '[removed]'
    ).map(s => ({
      title: s.title,
      selftext: s.selftext,
      subreddit: s.subreddit,
      created_utc: s.created_utc,
    }));

    return { deletedComments, deletedSubmissions };
  } catch {
    return { deletedComments: [], deletedSubmissions: [] };
  }
}

/**
 * Analyze deleted content for evidence of abusive behavior
 * Flags particularly problematic deleted content
 */
export async function analyzeDeletedContent(
  username: string,
  geminiApiKey: string
): Promise<{
  flaggedContent: Array<{ text: string; reason: string; severity: 'low' | 'moderate' | 'severe' }>;
  summary: string;
} | null> {
  const deleted = await getDeletedUserContent(username, { limit: 50 });

  if (deleted.deletedComments.length === 0 && deleted.deletedSubmissions.length === 0) {
    return null;
  }

  const allContent = [
    ...deleted.deletedComments.map(c => c.body),
    ...deleted.deletedSubmissions.map(s => `${s.title}: ${s.selftext || ''}`),
  ].slice(0, 30).join('\n---\n').slice(0, 6000);

  const prompt = `Analyze this DELETED Reddit content from u/${username} for signs of abusive behavior.
These are posts/comments the user deleted (or were removed by mods).

CONTENT:
${allContent}

Identify any content that shows:
- Harassment or personal attacks
- Hate speech or slurs
- Threats or intimidation
- Brigading coordination
- Deception or manipulation

Return JSON only:
{
  "flaggedContent": [
    {"text": "brief quote", "reason": "why flagged", "severity": "low|moderate|severe"}
  ],
  "summary": "1-2 sentence summary of deleted content patterns"
}

If nothing problematic found, return: {"flaggedContent": [], "summary": "No problematic patterns found."}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
        }),
      }
    );

    if (!response.ok) return null;

    interface GeminiResponse {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }

    const data = await response.json() as GeminiResponse;
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    if (text.startsWith('```')) {
      text = text.split('```')[1];
      if (text.startsWith('json')) text = text.slice(4);
    }
    text = text.trim();

    return JSON.parse(text) as {
      flaggedContent: Array<{ text: string; reason: string; severity: 'low' | 'moderate' | 'severe' }>;
      summary: string;
    };
  } catch {
    return null;
  }
}

/**
 * Format user analysis for display in leaderboard context
 */
export function formatUserAnalysisForLeaderboard(analysis: UserAnalysis): string {
  const flags = analysis.accountFlags?.join(', ') || 'none';
  const style = analysis.engagementStyle || 'unknown';

  return `**u/${analysis.username}**
- Account: ${analysis.accountAge || 'unknown'} old, ${analysis.totalKarma || 0} karma
- Flags: ${flags}
- Style: ${style}
${analysis.behaviorSummary ? `- Summary: ${analysis.behaviorSummary}` : ''}`;
}

/**
 * Format user analysis for farewell-hero context
 */
export function formatUserAnalysisForFarewell(analysis: UserAnalysis): string {
  const parts: string[] = [];

  if (analysis.accountAge) {
    parts.push(`Account age: ${analysis.accountAge}`);
  }

  if (analysis.totalKarma !== undefined) {
    parts.push(`Total karma: ${analysis.totalKarma.toLocaleString()}`);
  }

  if (analysis.recentActivitySubs && analysis.recentActivitySubs.length > 0) {
    parts.push(`Also active in: ${analysis.recentActivitySubs.slice(0, 5).map(s => `r/${s}`).join(', ')}`);
  }

  if (analysis.postFrequency) {
    parts.push(`Activity level: ${analysis.postFrequency}`);
  }

  return parts.join(' | ');
}
