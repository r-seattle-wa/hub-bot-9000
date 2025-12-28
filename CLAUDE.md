# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Hub Bot 9000 is a monorepo containing multiple Reddit Devvit apps for community engagement and moderation. Each app is independently deployable.

## Monorepo Structure

```
hub-bot-9000/
├── packages/
│   ├── common/                   # Shared utilities (@hub-bot/common)
│   │   └── src/
│   │       ├── redis.ts          # Redis helpers (getJson, setJson)
│   │       ├── rate-limiter.ts   # Configurable rate limiting
│   │       ├── ai-provider.ts    # Gemini BYOK + tone classification
│   │       ├── pullpush.ts       # PullPush.io API client
│   │       ├── leaderboard.ts    # Hater tracking (subs + users)
│   │       ├── user-analysis.ts  # Behavioral profiling (OSINT)
│   │       ├── disclosure.ts     # Bot footer templates
│   │       ├── wiki.ts           # Wiki page utilities
│   │       ├── opt-out.ts        # User opt-out system
│   │       ├── http.ts           # Rate-limited fetch
│   │       └── types.ts          # Shared types
│   │
│   ├── haiku-sensei/             # Haiku detection bot
│   │   ├── src/
│   │   │   ├── main.tsx          # Devvit app entry
│   │   │   ├── detector.ts       # 5-7-5 pattern detection
│   │   │   └── syllables.ts      # Syllable counting
│   │   └── devvit.yaml
│   │
│   ├── brigade-sentinel/         # TotesMessenger revival + hater tracking
│   │   ├── src/
│   │   │   ├── main.tsx          # Devvit app entry
│   │   │   └── templates.ts      # Comment templates
│   │   └── devvit.yaml
│   │
│   └── farewell-hero/            # Unsubscribe announcement responder
│       ├── src/
│       │   ├── main.tsx          # Devvit app entry
│       │   ├── detector.ts       # "I'm leaving" pattern detection
│       │   ├── stats.ts          # User activity aggregation
│       │   └── responses.ts      # Witty response templates
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

# Build specific package
cd packages/haiku-sensei && npm run build

# Devvit commands (run from package directory)
cd packages/haiku-sensei
devvit playtest r/YourTestSubreddit
devvit upload
devvit publish

# Check logs
devvit logs r/YourTestSubreddit
```

## Apps Overview

| App | Purpose | Devvit Name |
|-----|---------|-------------|
| haiku-sensei | Detects accidental 5-7-5 haikus | `haiku-sensei` |
| brigade-sentinel | Cross-subreddit link alerts + hater leaderboard | `brigade-sentinel` |
| farewell-hero | "I'm unsubscribing" responder | `farewell-hero` |

## Shared Package (@hub-bot/common)

### Core Utilities

```typescript
import {
  // Redis
  getJson, setJson, REDIS_PREFIX,

  // Rate limiting
  checkRateLimit, consumeRateLimit,

  // Bot disclosure
  getBotFooter, getHaikuFooter,

  // Types
  SourceClassification, AIProvider,
} from '@hub-bot/common';
```

### AI Provider (BYOK)

```typescript
import {
  classifySubreddit,      // Classify a subreddit (FRIENDLY/NEUTRAL/ADVERSARIAL/HATEFUL)
  classifyPostTone,       // Classify tone of a specific post
  geminiCrosslinkSearch,  // Search for crosslinks via Gemini
  geminiSearchFallback,   // Generic Gemini search fallback
} from '@hub-bot/common';
```

### Leaderboard System

```typescript
import {
  // Recording
  recordHater,              // Record a hostile crosslink
  checkModLogForUser,       // Check mod log for spam actions

  // Alt tracking
  registerUserAlt,          // Link alt account to main
  registerSubredditAlt,     // Link alt subreddit to main

  // Retrieval
  getLeaderboard,           // Get current leaderboard data
  formatLeaderboardMarkdown, // Format for display

  // OSINT
  enrichTopHatersWithOSINT, // Analyze deleted content of top haters
  getHaterOSINTReport,      // Detailed report for one user

  // Types
  LeaderboardData, SubredditHaterEntry, UserHaterEntry,
} from '@hub-bot/common';
```

### User Analysis (OSINT)

```typescript
import {
  analyzeUser,              // Full user analysis
  getDeletedUserContent,    // Get deleted posts/comments via PullPush
  analyzeDeletedContent,    // AI analysis of deleted content

  // Types
  UserAnalysis, BehavioralProfile,
} from '@hub-bot/common';

// Example: Deep behavioral analysis
const analysis = await analyzeUser(context, username, {
  geminiApiKey: settings.geminiApiKey,
  includeRecentPosts: true,
  deepBehavioralAnalysis: true,  // Enables The-Profiler style analysis
});

// BehavioralProfile includes:
// - OCEAN traits (communication indicators)
// - Communication style (verbosity, formality, tone)
// - Moderation risk (trolling, deception, sockpuppet)
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

## Architecture Patterns

### Rate Limiting

```typescript
const rateCheck = await checkRateLimit(context.redis, 'userHaiku', authorId);
if (!rateCheck.allowed) return;

// ... do work ...

await consumeRateLimit(context.redis, 'userHaiku', authorId);
```

### Delayed Bot Replies

All bots use scheduler jobs for delayed replies:

```typescript
// Queue delayed reply
await context.scheduler.runJob({
  name: 'postDelayedReply',
  data: { postId, userId, content },
  runAt: new Date(Date.now() + delaySeconds * 1000),
});

// Scheduler job handles the actual reply
Devvit.addSchedulerJob({
  name: 'postDelayedReply',
  onRun: async (event, context) => {
    const { postId, content } = event.data;
    await context.reddit.submitComment({ id: postId, text: content });
  },
});
```

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
| Gemini Flash | All apps (optional) | BYOK (mod's key) | Tone classification, OSINT |

## Settings Pattern

```typescript
Devvit.addSettings([
  {
    name: 'enabled',
    type: 'boolean',
    label: 'Enable feature',
    defaultValue: true,
  },
  {
    name: 'replyDelaySeconds',
    type: 'number',
    label: 'Delay before replying (seconds)',
    defaultValue: 30,
  },
  {
    name: 'geminiApiKey',
    type: 'string',
    label: 'Your Gemini API key',
    isSecret: true,
  },
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
| `notifyBrigade` | brigade-sentinel | On-demand | Delayed crosslink notification |
| `postDelayedReply` | haiku-sensei | On-demand | Delayed haiku reply |
| `postDelayedFarewell` | farewell-hero | On-demand | Delayed farewell reply |

## ToS Compliance

See `FEATURE_BACKLOG.md` for detailed compliance notes. Key points:

- All bots disclose they are bots
- AI usage is disclosed when used
- No impersonation of humans
- Opt-out via blocking the bot account
- Rate limits prevent spam
- BYOK model - no API costs to developer
- Only PUBLIC data analyzed - no sensitive attribute inference
