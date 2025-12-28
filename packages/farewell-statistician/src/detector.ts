// Unsubscribe announcement detection

/**
 * Patterns that indicate someone is announcing they're leaving/unsubscribing
 */
const UNSUBSCRIBE_PATTERNS: RegExp[] = [
  // Direct statements
  /\b(i('m|am)|i('ve| have)) (unsubscrib(ed|ing)|leav(ing|e)|done with|quit(ting)?)\b/i,
  /\bunsubscribe[d]?\s+(from\s+)?(this|the) (sub|subreddit)\b/i,
  /\b(this|the) (sub|subreddit) (is|has) (gone|become|turned) (to\s+)?(shit|trash|garbage|toxic)/i,

  // Dramatic farewells
  /\b(goodbye|farewell|adios|so long|peace out),?\s*(r\/|this sub|everyone)/i,
  /\bused to (love|enjoy|like) this (sub|place|subreddit)\b/i,
  /\b(this|the) sub(reddit)? (used to be|was) (good|great|better)\b/i,

  // Leaving declarations
  /\b(i('m| am)|time to) (out|leaving|gone|outta here)\b/i,
  /\bthat's it,?\s*(i'm|i am) (done|out|leaving)\b/i,
  /\b(can't|cannot) (take|stand|handle) this (sub|subreddit) anymore\b/i,

  // Echo chamber / toxic complaints with leaving
  /\b(leaving|unsubbing|done)\b.*\b(toxic|echo.?chamber|circle.?jerk|hive.?mind)\b/i,
  /\b(toxic|echo.?chamber|circle.?jerk)\b.*\b(leaving|unsubbing|done)\b/i,
];

/**
 * Context keywords that increase confidence
 */
const CONTEXT_KEYWORDS = [
  'downhill',
  'used to be',
  'anymore',
  'toxic',
  'echo chamber',
  'circlejerk',
  'hivemind',
  'unsubscribed',
  'unsubscribing',
  'leaving',
  'goodbye',
  'farewell',
  'done with',
  'fed up',
  'last straw',
  'final straw',
];

/**
 * Negative patterns - things that indicate this is NOT an unsubscribe post
 */
const NEGATIVE_PATTERNS: RegExp[] = [
  /\bhow (do|can) (i|you) unsubscribe\b/i, // Asking how to unsubscribe
  /\b(should i|thinking about) (unsubscrib|leav)/i, // Considering, not doing
  /\bdon't (leave|unsubscribe)\b/i, // Telling others not to leave
  /\bwhy (did|are) (you|people) (leaving|unsubscribing)\b/i, // Asking why others left
];

export interface DetectionResult {
  isUnsubscribePost: boolean;
  confidence: number; // 0-1
  matchedPatterns: string[];
}

/**
 * Detect if text is an unsubscribe announcement
 */
export function detectUnsubscribePost(text: string): DetectionResult {
  const lowerText = text.toLowerCase();

  // Check negative patterns first
  for (const pattern of NEGATIVE_PATTERNS) {
    if (pattern.test(text)) {
      return { isUnsubscribePost: false, confidence: 0, matchedPatterns: [] };
    }
  }

  // Check main patterns
  const matchedPatterns: string[] = [];
  for (const pattern of UNSUBSCRIBE_PATTERNS) {
    if (pattern.test(text)) {
      matchedPatterns.push(pattern.source);
    }
  }

  if (matchedPatterns.length === 0) {
    return { isUnsubscribePost: false, confidence: 0, matchedPatterns: [] };
  }

  // Calculate confidence based on pattern matches and context keywords
  let confidence = Math.min(0.5 + matchedPatterns.length * 0.15, 0.8);

  // Boost confidence for context keywords
  const contextMatches = CONTEXT_KEYWORDS.filter((kw) => lowerText.includes(kw));
  confidence += contextMatches.length * 0.05;

  // Cap at 0.95
  confidence = Math.min(confidence, 0.95);

  return {
    isUnsubscribePost: confidence >= 0.5,
    confidence,
    matchedPatterns,
  };
}

/**
 * Quick pre-filter to avoid running regex on every post
 */
export function couldBeUnsubscribePost(text: string): boolean {
  const lowerText = text.toLowerCase();
  const quickChecks = [
    'unsubscrib',
    'leaving',
    'leave',
    'goodbye',
    'farewell',
    'done with',
    'quit',
    'toxic',
    'echo chamber',
    'circlejerk',
    "i'm out",
    'im out',
  ];

  return quickChecks.some((check) => lowerText.includes(check));
}
