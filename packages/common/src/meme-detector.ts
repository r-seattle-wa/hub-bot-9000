// Meme/Talking Point Detector
// Identifies repeated low-effort brigading phrases and maps to wiki debunks

import { TriggerContext, JobContext } from '@devvit/public-api';
import { getJson, setJson, REDIS_PREFIX } from './redis.js';

type AppContext = TriggerContext | JobContext;

// A detectable meme/talking point
export interface TalkingPoint {
  id: string;
  name: string;
  patterns: RegExp[];           // Patterns to match (case-insensitive)
  keywords: string[];           // Simple keyword matches
  wikiPage?: string;            // Wiki debunk page (relative to subreddit)
  debunkSummary: string;        // Brief counter-point
  category: 'political' | 'demographic' | 'meta' | 'generic';
}

// User's talking point usage
export interface UserTalkingPoints {
  username: string;
  detections: Record<string, {  // keyed by talking point ID
    count: number;
    lastDetected: number;
    examples: string[];         // Up to 3 example quotes
  }>;
  totalDetections: number;
  lastUpdated: number;
}

// Detection result
export interface TalkingPointDetection {
  talkingPoint: TalkingPoint;
  matchedText: string;
  isRepeat: boolean;            // User has used this before
  repeatCount: number;
  wikiLink?: string;            // Full wiki URL if available
}

// Define common talking points
// These are customized for Seattle-area subreddits but can be adapted
export const TALKING_POINTS: TalkingPoint[] = [
  // ===== POLITICAL =====
  {
    id: 'echo_chamber',
    name: 'Echo Chamber',
    patterns: [
      /echo\s*chamber/i,
      /circle\s*jerk/i,
      /hive\s*mind/i,
    ],
    keywords: ['echochamber', 'circlejerk', 'hivemind'],
    wikiPage: 'demographics',
    debunkSummary: 'Our surveys show diverse political views. See the data.',
    category: 'political',
  },
  {
    id: 'liberal_bias',
    name: 'Liberal Bias',
    patterns: [
      /liberal\s*(bias|bubble|echo)/i,
      /left(ist)?\s*sub(reddit)?/i,
      /dem(ocrat)?\s*propaganda/i,
      /blue\s*city\s+mentality/i,
    ],
    keywords: ['libtard', 'leftist sub', 'liberal bubble'],
    wikiPage: 'politics',
    debunkSummary: 'Seattle is ~70% Democrat. The sub reflects the city.',
    category: 'political',
  },
  {
    id: 'conservative_persecution',
    name: 'Conservative Persecution',
    patterns: [
      /conservatives?\s+(get\s+)?banned/i,
      /can'?t\s+be\s+republican\s+here/i,
      /right\s*wing(ers?)?\s+silenced/i,
      /maga\s+(not\s+)?allowed/i,
    ],
    keywords: ['conservatives banned', 'cant be republican'],
    wikiPage: 'moderation-policy',
    debunkSummary: 'Bans are for rule violations, not political views.',
    category: 'political',
  },

  // ===== DEMOGRAPHIC =====
  {
    id: 'transplants',
    name: 'Transplant Hate',
    patterns: [
      /transplants?\s+(ruined?|destroying)/i,
      /california(ns?)?\s+(ruined?|took\s+over)/i,
      /tech\s*bros?\s+destroyed/i,
      /go\s+back\s+to\s+(where|california)/i,
    ],
    keywords: ['transplants', 'californians ruined', 'tech bros'],
    wikiPage: 'demographics',
    debunkSummary: 'Migration patterns show diverse origins. Check the census data.',
    category: 'demographic',
  },
  {
    id: 'homeless_blame',
    name: 'Homeless Blame',
    patterns: [
      /homeless\s+(are\s+)?all\s+from/i,
      /bused?\s+in\s+homeless/i,
      /other\s+states?\s+send\s+(their\s+)?homeless/i,
    ],
    keywords: ['bused in homeless', 'homeless from california'],
    wikiPage: 'homelessness-faq',
    debunkSummary: 'Studies show most homeless are local. See the research.',
    category: 'demographic',
  },

  // ===== META (about the subreddit) =====
  {
    id: 'mod_abuse',
    name: 'Mod Abuse Claims',
    patterns: [
      /mods?\s+(are\s+)?(corrupt|nazis?)/i,
      /power\s*tripp?(ing)?\s+mods?/i,
      /mods?\s+(are\s+)?power\s*tripp?(ing)?/i,
      /ban[\s-]*happy\s+mods?/i,
      /mods?\s+silence/i,
      /corrupt\s+mods?/i,
    ],
    keywords: ['mod abuse', 'powertripping mods', 'corrupt mods', 'mods are corrupt', 'power tripping mod'],
    wikiPage: 'moderation-policy',
    debunkSummary: 'Mod actions are logged and reviewable. Appeal via modmail.',
    category: 'meta',
  },
  {
    id: 'brigading_accusation',
    name: 'Counter-Brigade Claims',
    patterns: [
      /you\s+(guys\s+)?brigade/i,
      /this\s+sub\s+brigades?/i,
      /you('?re|\s+are)\s+the\s+real\s+brigaders?/i,
    ],
    keywords: ['you brigade', 'you guys brigade'],
    wikiPage: 'brigading-policy',
    debunkSummary: 'Brigading is tracked both ways. See our data.',
    category: 'meta',
  },
  {
    id: 'typical_sub',
    name: 'Typical Sub Dismissal',
    patterns: [
      /typical\s+r\/\w+/i,
      /classic\s+r\/\w+/i,
      /of\s+course\s+r\/\w+/i,
      /this\s+sub\s+(always|never)/i,
    ],
    keywords: ['typical r/', 'classic r/', 'this sub always'],
    debunkSummary: 'Generalizing 100k+ users seems lazy.',
    category: 'meta',
  },

  // ===== GENERIC =====
  {
    id: 'npc',
    name: 'NPC Insult',
    patterns: [
      /\bnpcs?\b/i,
      /non\s*player\s*characters?/i,
      /you('?re|\s+are)\s+(all\s+)?npcs?/i,
    ],
    keywords: ['npc', 'npcs'],
    debunkSummary: 'Dehumanizing insults rarely lead to productive discussion.',
    category: 'generic',
  },
  {
    id: 'cope',
    name: 'Cope/Seethe',
    patterns: [
      /\bcope\b/i,
      /\bseethe\b/i,
      /cope\s+and\s+seethe/i,
      /stay\s+mad/i,
    ],
    keywords: ['cope', 'seethe', 'stay mad'],
    debunkSummary: 'Telling people to "cope" is not an argument.',
    category: 'generic',
  },
  {
    id: 'touch_grass',
    name: 'Touch Grass',
    patterns: [
      /touch\s+grass/i,
      /go\s+outside/i,
      /get\s+a\s+life/i,
      /basement\s+dweller/i,
    ],
    keywords: ['touch grass', 'get a life'],
    debunkSummary: 'Ad hominem detected. The post is still there.',
    category: 'generic',
  },
];

/**
 * Detect talking points in text
 */
export function detectTalkingPoints(text: string): TalkingPoint[] {
  const detected: TalkingPoint[] = [];
  const textLower = text.toLowerCase();

  for (const tp of TALKING_POINTS) {
    let matched = false;

    // Check patterns
    for (const pattern of tp.patterns) {
      if (pattern.test(text)) {
        matched = true;
        break;
      }
    }

    // Check keywords if no pattern matched
    if (!matched) {
      for (const keyword of tp.keywords) {
        if (textLower.includes(keyword.toLowerCase())) {
          matched = true;
          break;
        }
      }
    }

    if (matched) {
      detected.push(tp);
    }
  }

  return detected;
}

/**
 * Get user's talking point history
 */
export async function getUserTalkingPoints(
  context: AppContext,
  username: string
): Promise<UserTalkingPoints | null> {
  const key = `${REDIS_PREFIX.brigade}talkingpoints:${username.toLowerCase()}`;
  return getJson<UserTalkingPoints>(context.redis, key);
}

/**
 * Record talking point usage for a user
 */
export async function recordTalkingPointUsage(
  context: AppContext,
  username: string,
  talkingPoint: TalkingPoint,
  exampleText: string
): Promise<TalkingPointDetection> {
  const key = `${REDIS_PREFIX.brigade}talkingpoints:${username.toLowerCase()}`;

  let userTps = await getJson<UserTalkingPoints>(context.redis, key);
  if (!userTps) {
    userTps = {
      username: username.toLowerCase(),
      detections: {},
      totalDetections: 0,
      lastUpdated: Date.now(),
    };
  }

  // Get or create detection record
  if (!userTps.detections[talkingPoint.id]) {
    userTps.detections[talkingPoint.id] = {
      count: 0,
      lastDetected: 0,
      examples: [],
    };
  }

  const detection = userTps.detections[talkingPoint.id];
  const isRepeat = detection.count > 0;

  detection.count++;
  detection.lastDetected = Date.now();

  // Store up to 3 examples
  if (detection.examples.length < 3) {
    const trimmedExample = exampleText.slice(0, 200);
    if (!detection.examples.includes(trimmedExample)) {
      detection.examples.push(trimmedExample);
    }
  }

  userTps.totalDetections++;
  userTps.lastUpdated = Date.now();

  await setJson(context.redis, key, userTps, 365 * 24 * 60 * 60); // 1 year TTL

  return {
    talkingPoint,
    matchedText: exampleText.slice(0, 100),
    isRepeat,
    repeatCount: detection.count,
    wikiLink: talkingPoint.wikiPage,
  };
}

/**
 * Get user's most repeated talking points
 */
export async function getTopRepeatedTalkingPoints(
  context: AppContext,
  username: string,
  limit: number = 3
): Promise<Array<{ talkingPoint: TalkingPoint; count: number }>> {
  const userTps = await getUserTalkingPoints(context, username);
  if (!userTps) return [];

  const results: Array<{ talkingPoint: TalkingPoint; count: number }> = [];

  for (const [tpId, data] of Object.entries(userTps.detections)) {
    const tp = TALKING_POINTS.find(t => t.id === tpId);
    if (tp && data.count > 1) { // Only include repeats
      results.push({ talkingPoint: tp, count: data.count });
    }
  }

  return results
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Format wiki link for a subreddit
 */
export function formatWikiLink(
  subredditName: string,
  wikiPage: string
): string {
  return `/r/${subredditName}/wiki/${wikiPage}`;
}

/**
 * Get debunk links for detected talking points
 */
export function getDebunkLinks(
  subredditName: string,
  talkingPoints: TalkingPoint[]
): Array<{ text: string; url: string; summary: string }> {
  return talkingPoints
    .filter(tp => tp.wikiPage)
    .map(tp => ({
      text: tp.name,
      url: formatWikiLink(subredditName, tp.wikiPage!),
      summary: tp.debunkSummary,
    }));
}

/**
 * Check if user qualifies for "broken record" achievement
 */
export async function checkBrokenRecordStatus(
  context: AppContext,
  username: string
): Promise<{ qualifies: boolean; repeatedMemes: string[] }> {
  const userTps = await getUserTalkingPoints(context, username);
  if (!userTps) return { qualifies: false, repeatedMemes: [] };

  const repeatedMemes: string[] = [];

  for (const [tpId, data] of Object.entries(userTps.detections)) {
    if (data.count >= 3) {
      const tp = TALKING_POINTS.find(t => t.id === tpId);
      if (tp) repeatedMemes.push(tp.name);
    }
  }

  return {
    qualifies: repeatedMemes.length >= 1, // At least one meme repeated 3+ times
    repeatedMemes,
  };
}
