# Hub Bot 9000 - Feature Backlog

## AI in Devvit: Best Practices & Compliance

### Reddit's Official Requirements

From the [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy):

1. **Bot Disclosure Required** - Bots must clearly disclose they are bots. Cannot circumvent Reddit's bot labeling.
2. **No Impersonation** - After the [University of Zurich incident](https://www.engadget.com/ai/researchers-secretly-experimented-on-reddit-users-with-ai-generated-comments-194328026.html) (bots secretly posing as humans), Reddit is cracking down hard.
3. **Explicit Consent for DMs** - Bots must get user consent before private messages.
4. **No Spam** - Cannot post identical/similar content across subreddits.
5. **No Manipulation** - Cannot manipulate votes, karma, or circumvent blocks/bans.
6. **Scoped Access** - Only access subreddits and API actions actually needed.

### AI-Generated Comment Guidelines

| Rule | Implementation |
|------|----------------|
| Disclose AI involvement | Footer: `^(AI-assisted analysis by hub-bot-9000)` |
| Don't impersonate humans | Use clear bot voice, not conversational |
| Identify as bot account | Devvit apps already run as app accounts |
| No deceptive content | Stats must be accurate, classifications disclosed |

### Our Compliance Approach

```typescript
// Every AI-assisted comment includes disclosure
const AI_DISCLOSURE_FOOTER = `
^(🤖 Automated message by hub-bot-9000.)
^([About](https://developers.reddit.com/apps/hub-bot-9000) | Opt-out: block this account)
`;

// When AI classification is used
const AI_CLASSIFICATION_NOTE = `
^(Source classification: {classification} - {method})
// method = "mod list" | "AI analysis" | "default"
`;
```

### AI Provider Strategy: BYOK (Bring Your Own Key)

**We don't pay for the internet's meme wars.** Subreddit mods provide their own API keys.

```typescript
// AI provider hierarchy (checked in order)
enum AIProvider {
  REDDIT_LOCAL = 'reddit',      // Reddit's built-in AI (if available)
  GEMINI_BYOK = 'gemini',       // Mod-provided Gemini API key
  NONE = 'none',                // No AI, manual lists only
}

// App settings (configured by installing mod)
interface AISettings {
  aiProvider: AIProvider;
  geminiApiKey?: string;        // Mod's own API key (stored securely)
  // Reddit local AI uses no key - it's platform-provided
}
```

**Fallback behavior when no AI configured:**
- Unknown subreddits → treated as NEUTRAL
- No auto-classification
- Mods must manually maintain adversarial/hateful lists
- Bot still fully functional, just less smart

**Reddit Local AI:**
- Reddit has been rolling out platform AI features
- If/when available in Devvit, prefer this (no cost to anyone)
- Check `context.ai` or similar API surface

### Gemini Best Practices (when BYOK enabled)

From [Google's Gemini moderation guide](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/gemini-for-filtering-and-moderation):

1. **Set temperature to 0** - Deterministic outputs for classification
2. **Use JSON output format** - Structured, parseable responses
3. **Disable Gemini's safety filters** - When doing content classification, you need to see the content
4. **Cache aggressively** - Same subreddit = same classification for days
5. **Use Gemini Flash** - Cheapest/fastest model, sufficient for classification

### Rate Limiting & Efficiency

```typescript
// Per-subreddit daily limits
const LIMITS = {
  publicComments: 50,      // Max bot comments per day per sub
  geminiCalls: 20,         // Max AI classifications per day
  pullpushQueries: 100,    // Max deleted content lookups
  modmailMessages: 10,     // Max modmail notifications
};

// Backoff strategy
const BACKOFF = {
  onRateLimit: 'exponential',  // 1s, 2s, 4s, 8s...
  onApiError: 'linear',        // 5s, 10s, 15s...
  maxRetries: 3,
};
```

### What NOT to Do

- ❌ Generate conversational replies that seem human
- ❌ Use AI to write persuasive arguments
- ❌ Hide that classifications come from AI
- ❌ Auto-moderate without mod approval (inform only)
- ❌ Analyze user post history without disclosure
- ❌ Send unsolicited DMs

### What's Okay

- ✅ Factual statistics about public activity
- ✅ Classification with clear methodology disclosure
- ✅ Templated responses with variable data
- ✅ AI-assisted pattern detection (with disclosure)
- ✅ Opt-out mechanisms

---

## Architecture Decision: Monolith vs Separate Apps

**Recommendation: Separate Devvit apps per feature**

Reasons:
- **Permissions isolation** - Each app only requests permissions it needs
- **Independent deployment** - Update haiku bot without risking brigade detector
- **Mod choice** - Subreddits can install only features they want
- **Rate limit isolation** - One bot hitting limits won't affect others
- **Easier ToS compliance** - Simpler to audit each app's behavior

**Shared code approach:** Create a shared `@hub-bot/common` package for:
- Redis helper utilities
- User stats aggregation functions
- Common regex patterns
- Rate limiting helpers

---

## Feature 1: Haiku Bot (haiku-sensei)

**Status:** Concept
**Complexity:** Low
**ToS Risk:** Low

### Description
Detects accidental haikus (5-7-5 syllable patterns) in comments and posts, then replies with the text formatted as a haiku.

### Implementation
```
Trigger: OnCommentCreate, OnPostCreate
Detection: Syllable counting algorithm
Response: Reply with formatted haiku + attribution
```

### Settings
- `enabled` (boolean) - Master toggle
- `minKarma` (number) - Minimum author karma to respond to
- `cooldownMinutes` (number) - Per-user cooldown
- `excludeFlairs` (string[]) - Post flairs to ignore

### ToS Considerations
- Respect rate limits (max 1 reply per minute suggested)
- Don't reply to bot accounts
- Include opt-out mechanism (user block = no more replies to them)

---

## Feature 2: Brigade Sentinel (totes-messenger-revival)

**Status:** Planned
**Complexity:** High
**ToS Risk:** Medium - requires careful implementation

### Description
Spiritual successor to TotesMessenger. Detects when posts/comments in the subreddit are linked from other subreddits and notifies the community. Helps mods understand sudden influxes of hostile users.

### What TotesMessenger Did
1. Monitored Reddit for cross-subreddit links
2. Posted a comment in the linked thread: "This thread has been linked to from [r/OtherSubreddit](link)"
3. Helped communities understand why they were suddenly being brigaded

### Enhanced Features for Revival

#### Core Detection
```
Method 1: Incoming link detection
- Use Devvit's context.reddit API to search for mentions
- Periodic scheduler job scans for new links to subreddit posts
- Store seen links in Redis to avoid duplicates

Method 2: Traffic pattern analysis
- Track comment velocity per post
- Flag posts with unusual activity spikes
- Cross-reference with external link timing
```

#### PullPush Integration (Deleted Content Recovery)
```
External API: https://api.pullpush.io/reddit/search/comment/
- Query deleted comments by thread ID
- Reconstruct deleted brigade comments
- Show mods what attackers said before deletion

Rate limits: Respect pullpush.io limits (be a good citizen)
Caching: Store results in Redis with TTL
```

#### Notification System
```
DEFAULT: Public comment in thread (like original TotesMessenger)
  - Informs community why they're seeing unusual activity
  - Includes source classification (neutral/adversarial/hateful)
  - Links to source thread for transparency

OPTIONAL (mod-enabled):
  - Modmail notification (private, actionable)
  - Mod-only sticky comment (visible but official)
  - Custom post widget showing recent brigades
```

#### Source Classification System
```typescript
enum SourceClassification {
  NEUTRAL = 'neutral',           // Unknown or general discussion subs
  FRIENDLY = 'friendly',         // Trusted subs (r/bestof, sister subs)
  ADVERSARIAL = 'adversarial',   // Known drama/callout subs
  HATEFUL = 'hateful',           // Hate subs, harassment-focused
}

// Mod-configurable lists stored in Redis
interface SubredditClassifications {
  friendly: string[];      // Don't notify at all
  adversarial: string[];   // Warn users, flag for mods
  hateful: string[];       // Strong warning, auto-flag for mods
  // Unlisted subs default to NEUTRAL
}
```

#### Default Comment Templates
```markdown
// NEUTRAL source
📬 **Crosspost Alert**

This thread has been linked from [r/{sourceSubreddit}]({sourceUrl}).

^(I am a bot. I notify communities when they are linked elsewhere on Reddit.)

---

// ADVERSARIAL source
⚠️ **Crosspost Alert - Exercise Caution**

This thread has been linked from [r/{sourceSubreddit}]({sourceUrl}),
a subreddit known for hostile crossposts.

If you're visiting from that link, please remember Rule 1 and engage in good faith.

^(I am a bot. Source classified as adversarial by r/{subreddit} moderators.)

---

// HATEFUL source
🚨 **Brigade Warning**

This thread has been linked from [r/{sourceSubreddit}]({sourceUrl}),
a subreddit flagged for harassment and hate content.

**To community members:** You may see an influx of bad-faith comments.
Report rule violations, don't engage with trolls.

**To visitors:** Brigading violates Reddit's Content Policy and may result
in account suspension.

^(I am a bot. Source classified as hateful by r/{subreddit} moderators.)
```

### Settings

#### Core Settings
- `enabled` (boolean) - Master toggle
- `publicComment` (boolean, default: true) - Post public comment in linked thread
- `modmailNotify` (boolean, default: false) - Also send modmail for adversarial/hateful
- `stickyComment` (boolean, default: false) - Sticky the bot comment (requires mod perms)
- `minimumLinkAge` (minutes, default: 5) - Wait before notifying (avoid false positives)
- `minSourceSubSize` (number, default: 1000) - Minimum subscribers of linking sub

#### Source Classification Settings
- `friendlySubreddits` (string[]) - Trusted subs, no notification
- `adversarialSubreddits` (string[]) - Known hostile subs, warning comment
- `hatefulSubreddits` (string[]) - Hate/harassment subs, strong warning + auto-modmail

#### PullPush Integration
- `includeDeletedContent` (boolean, default: true) - Recover deleted brigade comments
- `deletedContentThreshold` (number, default: 3) - Min deleted comments to mention in notification
- `showDeletedInModmail` (boolean, default: true) - Include deleted content excerpts in modmail

#### AI Classification (BYOK - Mod Provides API Key)
- `aiProvider` (enum: none/reddit/gemini, default: none) - AI provider selection
- `geminiApiKey` (string, secret) - Mod's own Gemini API key
- `cacheClassificationDays` (number, default: 7) - Cache AI classifications

### AI-Powered Source Analysis

For unknown subreddits not in manual lists, optionally use AI for classification.
**Mod pays for their own API usage** - we don't subsidize internet drama.

```typescript
// Provider selection
async function classifySubreddit(
  context: Devvit.Context,
  subreddit: string
): Promise<SourceClassification> {
  const settings = await context.settings.getAll();

  // 1. Check manual lists first (always free)
  if (settings.hatefulSubreddits?.includes(subreddit)) return 'hateful';
  if (settings.adversarialSubreddits?.includes(subreddit)) return 'adversarial';
  if (settings.friendlySubreddits?.includes(subreddit)) return 'friendly';

  // 2. Check cache
  const cached = await context.redis.get(`classification:${subreddit}`);
  if (cached) return JSON.parse(cached).classification;

  // 3. No AI configured? Default to neutral
  if (settings.aiProvider === 'none' || !settings.geminiApiKey) {
    return 'neutral';
  }

  // 4. Call AI (mod pays)
  return await callGeminiClassification(subreddit, settings.geminiApiKey);
}

// Efficient prompt
const CLASSIFICATION_PROMPT = `
Classify this subreddit. Respond with ONLY one word:
FRIENDLY, NEUTRAL, ADVERSARIAL, or HATEFUL.

r/{subreddit}: {publicDescription}
Recent titles: {recentTitles}

Classification:`;
```

**Cost to mod (Gemini Flash pricing ~$0.075/1M tokens):**
- ~500 tokens per classification = ~$0.00004 per new subreddit
- With 7-day caching, a busy sub might spend $0.10/month on AI

**Efficiency measures:**
- Manual lists checked first (free)
- Cache all AI results 7 days
- Only classify subs with >1000 subscribers
- Batch during off-peak if possible
- No AI = still works, just defaults to NEUTRAL

### Data Model (Redis)
```typescript
interface BrigadeEvent {
  id: string;
  targetPostId: string;
  sourceSubreddit: string;
  sourcePostId: string;
  sourcePostTitle: string;
  detectedAt: number;
  notifiedAt: number | null;
  commentVelocityBefore: number;
  commentVelocityAfter: number;
  deletedCommentsFound: number;
}
```

### ToS Considerations
- **No vote manipulation detection** - Reddit ToS prohibits this
- **No username pinging** - Don't harass users from source subs
- **Public information only** - Only use publicly available data
- **PullPush compliance** - Respect their ToS and rate limits
- **Inform, don't auto-moderate** - Public comments inform community; mod actions are optional
- **Neutral tone for unknown sources** - Only escalate language for mod-classified adversarial/hateful
- **Gemini classification is advisory** - Mods can override, AI doesn't auto-escalate to "hateful"
- **Alt reports require mod confirmation** - User-submitted alt links go to modmail for approval before being applied; prevents false flagging of innocent users
- **OSINT is meta analysis only** - PullPush deleted content is analyzed for threats/tone for community safety; deleted content is never reposted or displayed publicly, only aggregated risk metrics shown to mods

### API Dependencies
- Reddit API (via Devvit context.reddit)
- PullPush.io API (external HTTP fetch) - free, rate-limited
- Gemini Flash API (optional, BYOK) - mod provides own key

---

## Feature 3: Unsubscribe Hero (farewell-hero)

**Status:** Planned
**Complexity:** Medium
**ToS Risk:** Low-Medium (public data only, but could be seen as harassment)

### Description
Detects posts/comments where users dramatically announce they're unsubscribing from the subreddit. Responds with their actual engagement statistics to provide context.

### Detection Patterns
```typescript
const UNSUBSCRIBE_PATTERNS = [
  // Direct statements
  /\b(i('m|am)|i('ve| have)) (unsubscrib(ed|ing)|leav(ing|e)|done with|quit(ting)?)\b/i,
  /\bunsubscribe[d]?\b.*\bthis (sub|subreddit)\b/i,
  /\b(this|the) (sub|subreddit) (is|has) (gone|become|turned)\b/i,

  // Dramatic farewells
  /\b(goodbye|farewell|adios|so long),?\s*(r\/|this sub)/i,
  /\bused to (love|enjoy|like) this (sub|place)\b/i,

  // High confidence combinations
  /\b(leaving|unsubbing|done)\b.*\b(toxic|echo.?chamber|circle.?jerk)\b/i,
];

// Require high confidence - multiple signals
const MIN_PATTERN_MATCHES = 1;
const CONTEXT_KEYWORDS = ['downhill', 'used to be', 'anymore', 'toxic', 'echo chamber'];
```

### User Stats to Display

#### From Devvit API (context.reddit)
```typescript
interface UserSubredditStats {
  // Post stats
  totalPosts: number;
  postKarmaInSub: number;
  firstPostDate: Date | null;
  lastPostDate: Date | null;

  // Comment stats
  totalComments: number;
  commentKarmaInSub: number;
  firstCommentDate: Date | null;
  lastCommentDate: Date | null;

  // Engagement
  accountAge: string;
  memberSince: Date | null;  // If determinable
  averagePostsPerMonth: number;
  averageCommentsPerMonth: number;
}
```

#### Stat Bot Dependency
- Can leverage existing stat-tracking Devvit apps
- Or build lightweight stats aggregator as shared module
- Cache user stats in Redis with reasonable TTL (1 hour)

### Response Template
```markdown
📊 **Farewell Statistics for u/{username}**

Your journey in r/{subreddit}:

| Metric | Value |
|--------|-------|
| Posts | {totalPosts} |
| Comments | {totalComments} |
| Post Karma | {postKarma} |
| Comment Karma | {commentKarma} |
| First Activity | {firstActivity} |
| Last Activity Before Today | {lastActivity} |
| Account Age | {accountAge} |

*{wittyComment}*

^(This bot tracks public activity only. Data may be incomplete for older accounts.)
```

### Witty Comments Pool
```typescript
const WITTY_RESPONSES = [
  "We'll miss your {totalComments} comments. Truly, we will.",
  "That's {daysSinceFirst} days of memories. Gone, like tears in rain.",
  "{totalPosts} posts later, the saga ends.",
  "Your karma stays here. Literally, that's how Reddit works.",
  "See you next week!",  // For frequent "leavers"
];

// Special responses
const LURKER_RESPONSE = "Ah yes, we'll definitely notice the absence of your... *checks notes* ...{totalPosts} posts.";
const POWER_USER_RESPONSE = "Genuinely, thank you for {totalPosts} posts and {totalComments} comments over {timespan}. Your contributions mattered.";
```

### Settings
- `enabled` (boolean)
- `minConfidence` (number 0-1) - Detection confidence threshold
- `includeLurkerRoasts` (boolean) - Enable gentle ribbing for low-activity leavers
- `respectPowerUsers` (boolean) - Sincere response for high-contribution users
- `powerUserThreshold` (number) - Posts+comments to qualify as power user
- `cooldownHours` (number) - Per-user cooldown

### ToS Considerations
- **Public data only** - Only reference publicly visible posts/comments
- **No harassment** - Keep tone playful, not mean
- **Opt-out** - Respect blocks, add "don't reply to me" command
- **Rate limiting** - Don't spam, max 1 response per thread
- **Mod override** - Allow mods to disable per-thread

### Edge Cases
- User has no activity in sub (true lurker) - Short response
- User is actually a major contributor - Respectful farewell
- User announces leaving multiple times - Track in Redis, adjust response
- Deleted account - Handle gracefully

---

## Feature 4: Stat Tracker (shared dependency)

**Status:** Foundational
**Complexity:** Medium

### Description
Shared module that other bots can depend on for user statistics. Runs as background job aggregating user activity.

### Implementation
```typescript
// Scheduler job - runs hourly
Devvit.addSchedulerJob({
  name: 'aggregateUserStats',
  onRun: async (event, context) => {
    // Get recent posts/comments
    // Update rolling statistics in Redis
    // Prune old data
  }
});

// On-demand lookup
export async function getUserStats(
  context: Devvit.Context,
  username: string
): Promise<UserStats> {
  // Check cache
  // If miss, fetch from Reddit API
  // Update cache
  // Return stats
}
```

### Data Storage (Redis)
```
Key pattern: stats:user:{username}
TTL: 1 hour for active users, 24 hours for inactive
Pruning: Remove users not seen in 30 days
```

---

## Implementation Priority

### Phase 1: Foundation
1. Set up monorepo structure with shared packages
2. Implement Stat Tracker shared module
3. Deploy Haiku Bot (lowest risk, proves infrastructure)

### Phase 2: Engagement Features
4. Implement Unsubscribe Hero
5. Test extensively on r/SeattleModTests
6. Refine detection patterns based on false positives

### Phase 3: Moderation Tools
7. Implement Brigade Sentinel core (without PullPush)
8. Add PullPush integration
9. Build mod dashboard widget

---

## Monorepo Structure

```
hub-bot-9000/
├── packages/
│   ├── common/                    # Shared utilities
│   │   ├── src/
│   │   │   ├── redis-helpers.ts
│   │   │   ├── user-stats.ts
│   │   │   ├── rate-limiter.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── haiku-sensei/             # Haiku detection bot
│   │   ├── src/
│   │   │   └── main.tsx
│   │   ├── devvit.yaml
│   │   └── package.json
│   │
│   ├── brigade-sentinel/          # TotesMessenger revival
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── detectors/
│   │   │   │   ├── crosslink-scanner.ts
│   │   │   │   └── velocity-analyzer.ts
│   │   │   ├── integrations/
│   │   │   │   └── pullpush.ts
│   │   │   └── notifiers/
│   │   │       ├── comment.ts
│   │   │       ├── modmail.ts
│   │   │       └── widget.ts
│   │   ├── devvit.yaml
│   │   └── package.json
│   │
│   └── farewell-hero/             # Unsubscribe hero
│       ├── src/
│       │   ├── main.tsx
│       │   ├── detectors/
│       │   │   └── unsubscribe-patterns.ts
│       │   ├── stats/
│       │   │   └── user-analyzer.ts
│       │   └── responses/
│       │       └── templates.ts
│       ├── devvit.yaml
│       └── package.json
│
├── package.json                   # Workspace root
├── tsconfig.base.json
└── FEATURE_BACKLOG.md
```

---

## External API Reference

### PullPush.io
```
Base URL: https://api.pullpush.io

Endpoints:
- /reddit/search/comment/?link_id={post_id}  # Comments by post
- /reddit/search/submission/?subreddit={sub}  # Posts by subreddit

Rate Limits: Be respectful, cache aggressively
Documentation: https://pullpush.io/api-docs/
```

### Reddit via Devvit
```typescript
// Search for posts linking to our subreddit
const results = await context.reddit.search({
  query: `url:reddit.com/r/${subreddit}`,
  sort: 'new',
  time: 'day'
});

// Get user's posts in subreddit
const posts = await context.reddit.getPostsByUser({
  username,
  subreddit,
  limit: 100
});

// Get user's comments in subreddit
const comments = await context.reddit.getCommentsByUser({
  username,
  // Note: May need to filter by subreddit client-side
});
```

---

---

## Implemented Features

### Feature 5: Hater Achievement System (COMPLETE)

**Status:** Implemented
**Location:** `packages/common/src/achievements.ts`, `meme-detector.ts`, `achievement-roast.ts`

Xbox-style achievement system that acknowledges dedicated haters with:
- 11 achievements across 5 tiers (Bronze -> Diamond)
- AI-generated personalized roasts
- Talking point detection (12 common memes tracked)
- Wiki debunk links
- Leaderboard position callouts

#### Achievement Tiers
| Tier | Score | Achievements |
|------|-------|--------------|
| Bronze | 5-9 | Casual Complainer, New Challenger |
| Silver | 10-24 | Serial Brigader |
| Gold | 25-49 | Professional Hater |
| Platinum | 50-99 | Legendary Salt Lord, Broken Record, Main Character |
| Diamond | 100+ | Transcendent Malcontent, Shadow Exposed |

#### Triggering Conditions
- Score milestones (5, 10, 25, 50, 100 points)
- First hostile link (new challenger)
- Repeated talking points (broken record)
- Alt account exposure
- Top 10 leaderboard entry

### Feature 6: Community Events Integration (COMPLETE)

**Status:** Implemented
**Location:** `packages/common/src/event-fetcher.ts`, `packages/brigade-sentinel/src/main.tsx`

Fetches local community events for display in hub-widget with three data sources:

| Source | Auth | Priority | Notes |
|--------|------|----------|-------|
| Reddit AI | None (Devvit built-in) | 1 | Free, uses context.ai |
| Gemini | BYOK | 2 | Uses grounded search |
| Scraper Service | API key | 3 | Cloud Run fallback |

#### Settings
| Setting | Description | Default |
|---------|-------------|---------|
| `enableEventFetching` | Enable event fetching | `false` |
| `eventLocation` | Location for search | `""` |
| `eventState` | State abbreviation | `""` |
| `scraperServiceUrl` | Cloud Run URL | `""` |
| `useRedditAI` | Prefer Reddit AI | `true` |

#### Event Flow
```
brigade-sentinel (every 6 hours)
  -> fetchCommunityEvents()
  -> emitCommunityEvent() -> wiki storage
  -> hub-widget displays with @ icon (purple)
```



### Feature 7: Tribute Feature (COMPLETE)

**Status:** Implemented & Merged
**Location:** `packages/farewell-hero/` (merged), `packages/common/src/tribute.ts` (shared logic)

Satirical tribute generator that channels the essence of subreddits and users. Spiritual successor to [Seattle-Simulator](https://github.com/r-seattle-wa/Seattle-Simulator). Originally planned as standalone `tribute-bot`, merged into `farewell-hero` for simpler deployment.

#### Trigger Command
```
!tribute              # Default subreddit (configurable)
!tribute r/Seattle    # Specific subreddit
!tribute u/username   # Specific user
```

#### Features
- **5 Sarcasm Levels**: Polite, Neutral, Snarky, Roast, Freakout
- **Dual AI Provider**: Groq (free tier) primary, Gemini fallback
- **Context Analysis**: Fetches recent posts/comments for style mimicry
- **Image Generation**: Optional AI-generated tribute art (Gemini Imagen)
- **Rate Limiting**: 5 tributes/user/hour, 30 tributes/sub/day
- **Opt-out**: Block bot or wiki-based opt-out

#### Settings (in farewell-hero)
| Setting | Description | Default |
|---------|-------------|---------|
| `enableTributes` | Enable !tribute command | `true` |
| `sarcasmLevel` | Default sarcasm level | `neutral` |
| `groqApiKey` | Groq API key (free tier) | - |
| `geminiApiKey` | Gemini API key (fallback) | - |
| `defaultTributeTarget` | Default subreddit | `Seattle` |
| `allowUserTributes` | Allow u/username targets | `true` |
| `replyDelaySeconds` | Delay before reply | `30` |

#### Hater Leaderboard Integration
Each tribute request adds +0.5 points to the requesting user's hater score (playful rivalry).

```typescript
// Score formula now includes tribute requests
score = adversarialCount
      + (hatefulCount * 3)
      + (modLogSpamCount * 2)
      + (flaggedContentCount * 2)
      + (tributeRequestCount * 0.5)
```

#### ToS Compliance
- Framed as "tribute/homage" not impersonation
- Clear AI disclosure in footer
- Opt-out via blocking
- Rate limited to prevent spam
- Never claims to BE the user/community

---

---



### Feature 8: Thread Analysis System (COMPLETE)

**Status:** Implemented
**Location:** `packages/common/src/thread-analysis.ts`, `packages/common/src/__tests__/detection.test.ts`

Comprehensive thread analysis system for crosslinked posts that analyzes hater activity and awards achievements.

#### Thread Analysis Features
- **Hater Detection**: Identifies commenters from adversarial/hateful sources
- **Quote Extraction**: Captures representative quotes from hostile comments
- **Meme Detection**: Uses `detectTalkingPoints()` to identify common complaints
- **Achievement System**: Awards achievements based on hater activity
- **Wiki Storage**: Saves detailed analyses to wiki for historical record

#### Wiki Storage
Thread analyses are saved to `hub-bot-9000/thread-analyses` with:
- Full hater breakdown with usernames, quotes, sources
- Achievement unlocks triggered by the thread
- Summary statistics
- Timestamps for each analysis

#### Achievement XP System (NEW)
Achievement unlocks now grant XP tracked on the leaderboard:

| Tier | XP |
|------|-----|
| Bronze | 2 |
| Silver | 5 |
| Gold | 10 |
| Platinum | 20 |
| Diamond | 50 |

#### Leaderboard Entry Enhancement
`UserHaterEntry` now includes:
```typescript
{
  // ... existing fields
  unlockedAchievements?: Record<string, number>; // Achievement ID -> unlock timestamp
  achievementXP?: number;                         // Bonus XP from achievements
  highestAchievementTier?: string;               // Highest tier earned
}
```

#### Sticky Comment Integration
When crosslinks are detected, the bot can post sticky comments showing:
- Hater leaderboard table with usernames and quotes
- Achievement unlocks triggered
- Links to evidence wiki pages

#### Detection Tests
66 comprehensive tests covering:
- Meme detection (echo_chamber, transplants, mod_abuse, etc.)
- Achievement definitions (tiers, thresholds, unique IDs)
- Talking points coverage (categories, patterns)
- False positive prevention

## Open Questions

1. **Brigade Sentinel scope:** Should it also track outgoing links (when our users link to other subs)?

2. **Unsubscribe Hero tone:** How sarcastic is too sarcastic? Need mod-configurable tone setting?

3. **PullPush reliability:** Service has had downtime. Graceful degradation strategy?

4. **Cross-app communication:** If Stat Tracker and Farewell Statistician are separate apps, how do they share data? Redis namespace conventions?

5. **Legal considerations:** Any GDPR/privacy concerns with aggregating user stats even from public data?
