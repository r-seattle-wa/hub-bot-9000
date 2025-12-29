# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Hub Bot 9000 is a monorepo containing multiple Reddit Devvit apps for community engagement and moderation. Each app is independently deployable.

## Monorepo Structure

```
hub-bot-9000/
├── assets/
│   └── achievements/
│       └── general/              # 26 SVG achievement icons (64x64)
├── packages/
│   ├── common/                   # Shared utilities (@hub-bot/common)
│   │   └── src/
│   │       ├── redis.ts          # Redis helpers (getJson, setJson)
│   │       ├── rate-limiter.ts   # Configurable rate limiting
│   │       ├── ai-provider.ts    # Gemini BYOK + tone classification + bot replies
│   │       ├── pullpush.ts       # PullPush.io API client
│   │       ├── leaderboard.ts    # Hater tracking (subs + users)
│   │       ├── user-analysis.ts  # Behavioral profiling (OSINT)
│   │       ├── events-feed.ts    # Unified event feed (wiki-based)
│   │       ├── url-utils.ts      # Reddit URL extraction utilities
│   │       ├── disclosure.ts     # Bot footer templates
│   │       ├── wiki.ts           # Wiki page utilities
│   │       ├── opt-out.ts        # User opt-out system
│   │       ├── http.ts           # Rate-limited fetch
│   │       └── types.ts          # Shared types (SarcasmLevel, UserTone, events)
│   │
│   ├── haiku-sensei/             # Haiku detection bot
│   │   ├── src/
│   │   │   ├── main.tsx          # Devvit app entry + AI reply handler
│   │   │   ├── detector.ts       # 5-7-5 pattern detection
│   │   │   └── syllables.ts      # Syllable counting with exceptions
│   │   └── devvit.yaml
│   │
│   ├── brigade-sentinel/         # TotesMessenger revival + hater tracking
│   │   ├── src/
│   │   │   ├── main.tsx          # Devvit app entry + AI reply handler
│   │   │   └── templates.ts      # Comment templates
│   │   └── devvit.yaml
│   │
│   ├── farewell-hero/            # Unsubscribe announcement responder
│   │   ├── src/
│   │   │   ├── main.tsx          # Devvit app entry + AI reply handler
│   │   │   ├── detector.ts       # "I'm leaving" + political complaint detection
│   │   │   ├── stats.ts          # User activity + best post/comment
│   │   │   └── responses.ts      # 5 sarcasm levels + political responses
│   │   └── devvit.yaml
│   │
│   └── hub-widget/               # Unified events dashboard
│       ├── src/
│       │   └── main.tsx          # Custom Post Type widget
│       └── devvit.yaml
│
├── scraper-service/              # Cloud Run service (Python)
│   ├── main.py                   # FastAPI app
│   └── scrapers/                 # Event scrapers
│
├── FEATURE_BACKLOG.md            # Detailed specs and ToS compliance
└── package.json                  # Workspace root
```

## Key Commands

```bash
# Install all dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Build specific package
npm run build --workspace=@hub-bot/haiku-sensei

# Devvit commands (run from package directory)
cd packages/haiku-sensei
devvit playtest r/YourTestSubreddit
devvit upload
devvit install r/YourSubreddit
devvit publish

# Check logs
devvit logs r/YourTestSubreddit
```

## Apps Overview

| App | Purpose | Key Features |
|-----|---------|--------------|
| **haiku-sensei** | Detects accidental 5-7-5 haikus | Syllable counting, AI replies to users |
| **brigade-sentinel** | Cross-subreddit link alerts + hater leaderboard | OSINT, alt tracking, modmail alerts, traffic spike detection, achievements, community events |
| **farewell-hero** | "I'm unsubscribing" responder | 5 sarcasm levels, tone matching, best post/comment, political complaint detection, hater leaderboard integration |
| **hub-widget** | Unified events dashboard | Color-coded feed, auto-refresh, Custom Post Type |

## Shared Package (@hub-bot/common)

### Core Utilities

```typescript
import {
  // Redis
  getJson, setJson, REDIS_PREFIX,

  // Rate limiting
  checkRateLimit, consumeRateLimit, DEFAULT_LIMITS,

  // Bot disclosure
  getBotFooter, getHaikuFooter, getStatsFooter,

  // Types
  SourceClassification, AIProvider, SarcasmLevel, UserTone,
  HubBotEvent, HubBotEventType,
} from '@hub-bot/common';
```

### Sarcasm Levels & Tone Classification

```typescript
import { SarcasmLevel, UserTone, classifyUnsubscribeTone } from '@hub-bot/common';

// 5 sarcasm levels for responses
enum SarcasmLevel {
  POLITE = 'polite',      // Respectful, kind
  NEUTRAL = 'neutral',    // Matter-of-fact
  SNARKY = 'snarky',      // Light teasing
  ROAST = 'roast',        // Playful mockery
  FREAKOUT = 'freakout',  // ALL CAPS DRAMA
}

// Detected user tones
enum UserTone {
  POLITE = 'polite',
  NEUTRAL = 'neutral',
  FRUSTRATED = 'frustrated',
  HOSTILE = 'hostile',
  DRAMATIC = 'dramatic',
}

// Classify user's tone (uses Gemini if API key provided, else keyword fallback)
const result = await classifyUnsubscribeTone(text, geminiApiKey);
// Returns: { tone: UserTone, triggerPhrase?: string, confidence: number }
```

### AI Bot Replies

```typescript
import { generateBotReply } from '@hub-bot/common';

// Generate contextual AI reply when users respond to the bot
const reply = await generateBotReply(context, {
  botName: 'haiku-sensei',
  botPersonality: 'A zen haiku detection bot. Peaceful but witty.',
  originalBotComment: parentComment.body,
  userReply: comment.body,
  userUsername: authorName,
  geminiApiKey: settings.geminiApiKey,
});
// Returns null if no API key - falls back to canned responses
```

### Events Feed System

```typescript
import {
  // Read events
  readEventFeed,
  getRecentEvents,
  getEventsByType,

  // Emit events (used by bots)
  emitBrigadeAlert,
  emitHaikuDetection,
  emitFarewellAnnouncement,
  emitCourtDocket,
  emitTrafficSpike,
  emitCommunityEvent,
  emitSystemEvent,

  // Constants
  EVENT_FEED_WIKI_PAGE,  // 'hub-bot-9000/events-feed'
  HubBotEventType,
} from '@hub-bot/common';

// Events stored in wiki as JSON, 100-event rolling window, 7-day expiry
```

### AI Provider (BYOK)

```typescript
import {
  classifySubreddit,      // Classify a subreddit (FRIENDLY/NEUTRAL/ADVERSARIAL/HATEFUL)
  classifyPostTone,       // Classify tone of a specific post
  classifyUnsubscribeTone, // Classify farewell post tone
  generateBotReply,       // AI-powered reply generation
  geminiCrosslinkSearch,  // Search for crosslinks via Gemini
  geminiSearchFallback,   // Generic Gemini search fallback
} from '@hub-bot/common';
```

### Leaderboard System

```typescript
import {
  // Recording
  recordHater,              // Record a hostile crosslink or political complainer
  checkModLogForUser,       // Check mod log for spam actions

  // Alt tracking (requires mod confirmation)
  submitPendingAltReport,   // Submit pending alt report for mod review
  approveAltReport,         // Mod approves alt link
  rejectAltReport,          // Mod rejects alt link

  // Retrieval
  getLeaderboard,           // Get current leaderboard data
  formatLeaderboardMarkdown, // Format for display

  // OSINT
  enrichTopHatersWithOSINT, // Analyze deleted content of top haters
} from '@hub-bot/common';
```

### User Analysis (OSINT)

```typescript
import {
  analyzeUser,              // Full user analysis
  getDeletedUserContent,    // Get deleted posts/comments via PullPush
  analyzeDeletedContent,    // AI analysis of deleted content
  checkNotableContributor,  // Check if user was a top contributor
} from '@hub-bot/common';
```

### Achievement System

```typescript
import {
  // Achievement tracking
  checkAchievements,        // Check for unlocked achievements
  getHighestNewAchievement, // Get best new achievement to announce
  markAchievementNotified,  // Mark achievement as announced
  formatAchievementComment, // Format achievement announcement
  getAchievementById,       // Lookup achievement by ID
  
  // Constants
  ACHIEVEMENTS,             // All 11 achievement definitions
  TIER_EMOJIS,              // Tier icons (bronze->diamond)
  AchievementTier,          // bronze, silver, gold, platinum, diamond
} from '@hub-bot/common';

// 27 achievements across 5 tiers:
// Bronze: Casual Complainer, New Challenger, Broken Record, Echo Enthusiast,
//         Transplant Tracker, Mod Critic, Dramatic Departure, Shadow Lurker
// Silver: Serial Brigader, Top 10 Menace, Consistency Award, Meme Collector,
//         Encore Performer, Rage Machine, Multi-Front Warrior, Troll Suspect
// Gold: Professional Hater, Podium Pest, Mask Off, Meme Master, Farewell Trilogy,
//       Evidence Eraser, Story Teller
// Platinum: Legendary Salt Lord
// Diamond: Transcendent Malcontent, Supreme Antagonist
```

### Meme/Talking Point Detection

```typescript
import {
  detectTalkingPoints,       // Find talking points in text
  recordTalkingPointUsage,   // Track user's repeated memes
  checkBrokenRecordStatus,   // Check if user repeats same memes
  getTopRepeatedTalkingPoints, // Get user's most-used memes
  getDebunkLinks,            // Get wiki links to debunk pages
  TALKING_POINTS,            // All 12 talking point definitions
} from '@hub-bot/common';

// Tracked talking points with wiki debunk links:
// echo_chamber, liberal_bias, transplants, housing, homeless,
// censorship, astroturfing, politics_ban, crime_stats,
// moving_away, tech_bros, amazon
```

### AI Roast Generation

```typescript
import { generateAchievementRoast } from '@hub-bot/common';

// Generate personalized roasts for achievement announcements
const result = await generateAchievementRoast(context, {
  username,
  achievementName: 'Professional Hater',
  achievementTier: 'gold',
  achievementDescription: 'Reached 25+ hater points',
  baseRoastTemplate: 'Your dedication to negativity is impressive.',
  leaderboardPosition: 7,
  totalScore: 28,
  behaviorSummary: 'Frequent complaints about housing policies',
  repeatedMemes: ['echo_chamber', 'transplants'],
  geminiApiKey: settings.geminiApiKey,
});
// Returns: { roastText: string, imagePrompt?: string }
```

### Community Event Fetching

```typescript
import {
  fetchCommunityEvents,      // Main function - tries all sources
  fetchEventsWithRedditAI,   // Free, uses Devvit built-in AI
  fetchEventsWithGemini,     // BYOK, uses grounded search
  fetchEventsFromScraper,    // Cloud Run scraper service
  CommunityEvent,            // Event interface
} from '@hub-bot/common';

// Priority: Reddit AI (free) > Gemini (BYOK) > Scraper
const events = await fetchCommunityEvents(context, {
  location: 'Seattle',
  state: 'WA',
  days: 7,
  geminiApiKey: settings.geminiApiKey,
  scraperUrl: settings.scraperServiceUrl,
  useRedditAI: true,
});
```

### PullPush Integration

```typescript
import {
  findCrosslinks,       // Find posts linking to a subreddit
  getDeletedComments,   // Get deleted comments on a post
  searchComments,       // Search comments by author/subreddit
  searchSubmissions,    // Search posts by author/subreddit
} from '@hub-bot/common';
```

### URL Utilities

```typescript
import {
  extractRedditLinks,       // Extract all Reddit links from text
  containsRedditLinks,      // Check if text contains Reddit links
  getLinkedSubreddits,      // Get subreddit names from text
  getExternalSubredditLinks, // Filter out self-references
} from '@hub-bot/common';

// Returns array of { subreddit, fullUrl, postId?, commentId? }
const links = extractRedditLinks('Check out r/seattle and https://reddit.com/r/SeattleWA/comments/abc123');
```

## farewell-hero Features

### Sarcasm Levels
- **POLITE**: "Thank you for being part of our community."
- **NEUTRAL**: "Activity summary: X contributions over Y days."
- **SNARKY**: "We will definitely notice your *checks notes* 2 contributions."
- **ROAST**: "Your 2 contributions will be missed. By literally no one."
- **FREAKOUT**: "OH NO! NOT SOMEONE WITH 2 CONTRIBUTIONS! WHO WILL PROVIDE NOTHING?!"

### Political Complaint Detection
Detects "echo chamber" / "trump subreddit" / "liberal hivemind" complaints and responds with links to demographic surveys in the wiki.

### Best Post/Comment
Finds and displays user's highest-scoring post and comment:
```
**Greatest Hit (Post):** [Title](url) (+score)
**Greatest Hit (Comment):** [Preview...](url) (+score)
```

### Tone Matching
When `matchToneToUser` is enabled:
- POLITE user → POLITE response
- NEUTRAL user → configured default
- FRUSTRATED user → SNARKY minimum
- HOSTILE user → ROAST minimum
- DRAMATIC user → FREAKOUT (match energy)

## hub-widget Deployment

```bash
cd packages/hub-widget
devvit upload
devvit install r/YourSubreddit

# Then in the subreddit, use menu: "Create Hub Bot Events Widget"
```

### Event Types Displayed
| Type | Icon | Color | Description |
|------|------|-------|-------------|
| Brigade Alert | `!` | Red | Cross-subreddit link detected |
| Haiku Detection | `*` | Teal | Haiku found and replied to |
| Farewell | `~` | Yellow | Unsubscribe announcement responded to |
| Court Docket | `#` | Green | Ban court case (from r/seattlewabancourt) |
| Traffic Spike | `^` | Orange | Unusual comment velocity detected |
| Community Event | `@` | Purple | Local community events |
| System | `i` | Light green | System messages |

## Architecture Patterns

### Rate Limiting

```typescript
const rateCheck = await checkRateLimit(context.redis, 'userHaiku', authorId);
if (!rateCheck.allowed) return;
// ... do work ...
await consumeRateLimit(context.redis, 'userHaiku', authorId);
```

### Delayed Bot Replies

All bots use scheduler jobs for delayed replies to avoid appearing too bot-like.

### AI Reply Loop Prevention

Bots only reply once per conversation chain - they check the grandparent comment to avoid infinite loops.

### Hater Scoring Formula

```typescript
score = adversarialCount
      + (hatefulCount * 3)
      + (modLogSpamCount * 2)
      + (flaggedContentCount * 2)
```

## External APIs

| API | Used By | Auth | Purpose |
|-----|---------|------|---------|
| Reddit API | All apps | Devvit context | Core functionality |
| PullPush.io | brigade-sentinel, user-analysis | None (rate-limited) | Deleted content, crosslinks |
| Gemini Flash | All apps (optional) | BYOK (mod's key) | Tone classification, AI replies, OSINT |

## Settings Pattern

```typescript
Devvit.addSettings([
  { name: 'enabled', type: 'boolean', label: 'Enable feature', defaultValue: true },
  { name: 'sarcasmLevel', type: 'select', label: 'Default sarcasm level',
    options: [
      { label: 'Polite', value: 'polite' },
      { label: 'Neutral', value: 'neutral' },
      { label: 'Snarky', value: 'snarky' },
      { label: 'Roast', value: 'roast' },
      { label: 'Freakout', value: 'freakout' },
    ],
    defaultValue: ['neutral'] },
  { name: 'matchToneToUser', type: 'boolean', label: 'Match response tone to user', defaultValue: true },
  { name: 'enableBotReplies', type: 'boolean', label: 'Reply to users who respond', defaultValue: true },
  { name: 'geminiApiKey', type: 'string', label: 'Gemini API key', isSecret: true },
]);
```

## Redis Key Prefixes

```typescript
const REDIS_PREFIX = {
  haiku: 'haiku:',
  brigade: 'brigade:',
  farewell: 'farewell:',
  classification: 'classification:',
  rateLimit: 'ratelimit:',
  optOut: 'optout:',
};
```

## Scheduled Jobs

| Job | App | Schedule | Purpose |
|-----|-----|----------|---------|
| `scanForCrosslinks` | brigade-sentinel | Every 15 min | Find new crosslinks |
| `enrichHatersOSINT` | brigade-sentinel | Daily 3am | Analyze top haters' deleted content |
| `fetchCommunityEventsJob` | brigade-sentinel | Every 6 hours | Fetch local community events |
| `postAchievementComment` | brigade-sentinel | On-demand | Post achievement announcements |
| `notifyBrigade` | brigade-sentinel | On-demand | Delayed crosslink notification |
| `postHaikuReply` | haiku-sensei | On-demand | Delayed haiku reply |
| `postFarewellReply` | farewell-hero | On-demand | Delayed farewell reply |

## Test Suite

```bash
npm test  # Runs vitest across all packages

# Test coverage:
# - packages/common/src/__tests__/rate-limiter.test.ts
# - packages/haiku-sensei/src/__tests__/detector.test.ts
# - packages/haiku-sensei/src/__tests__/syllables.test.ts
# - packages/farewell-hero/src/__tests__/detector.test.ts
# - packages/farewell-hero/src/__tests__/responses.test.ts
```

## ToS Compliance

- All bots disclose they are bots
- AI usage is disclosed when used
- No impersonation of humans
- Opt-out via blocking the bot account
- Rate limits prevent spam
- BYOK model - no API costs to developer
- Only PUBLIC data analyzed - no sensitive attribute inference
- Alt reports require mod confirmation - prevents abuse/false linking
- OSINT is meta analysis only - deleted content never reposted
