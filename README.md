# Hub Bot 9000

A monorepo of [Reddit Developer Platform (Devvit)](https://developers.reddit.com) apps for community engagement, moderation, and entertainment.

**Originally built for [r/SeattleWA](https://reddit.com/r/SeattleWA)**, but designed to be adopted by any subreddit.

## Apps

| App | Purpose | Status |
|-----|---------|--------|
| [haiku-sensei](#haiku-sensei) | Detects accidental 5-7-5 haikus in comments | Ready |
| [brigade-sentinel](#brigade-sentinel) | Cross-subreddit link alerts with hater tracking | Ready |
| [farewell-hero](#farewell-hero) | Witty responses to "I'm unsubscribing" posts | Ready |

---

## Haiku Sensei

Detects when users accidentally write comments in 5-7-5 haiku syllable pattern and replies with their words formatted as a haiku.

### Features
- Syllable counting with dictionary fallback
- Rate limiting per user to prevent spam
- Configurable delay before replying
- Wiki-based opt-out system
- Bot disclosure footer

### Example
```
User comment: "I went to the store and bought some milk for my cat"

Bot reply:
I went to the store
and bought some milk for my cat
~ A haiku by u/example
```

---

## Brigade Sentinel

A spiritual successor to TotesMessenger - detects when other subreddits link to your community and provides transparency about crosslinks.

### Features

#### Cross-link Detection
- **PullPush.io integration** - Finds posts that link to your subreddit
- **Gemini AI fallback** - When PullPush is blocked, uses AI search grounding
- **Tone classification** - Each linking post classified as FRIENDLY, NEUTRAL, ADVERSARIAL, or HATEFUL
- **Configurable delay** - Wait before posting to avoid false positives

#### Hater Leaderboard
Track hostile crosslinks for posterity with dual leaderboards:

**Subreddit Leaderboard**
- Tracks which subreddits most frequently link with hostile intent
- Alt subreddit mapping (e.g., r/SeattleWACirclejerk -> r/SeattleWA)
- Score: adversarial + (hateful x 3)

**User Leaderboard**
- Tracks individual users who post hostile crosslinks
- Alt account mapping for serial offenders
- Mod log integration (+2 per removal, +6 per ban)
- OSINT enrichment via deleted content analysis

**Reporting Alts via Bot Mention**

Users can report alt accounts/subreddits by mentioning the bot in any comment:
```
u/brigade-sentinel alt u/mainaccount = u/altaccount
u/brigade-sentinel alt r/mainsubreddit = r/altsubreddit
```
The bot will confirm and consolidate scores on the leaderboard.

**Score Formula:**
```
Score = adversarial + (hateful x 3) + (mod log spam x 2) + (deleted content flags x 2)
```

#### OSINT Enrichment
- **Deleted content recovery** - PullPush archives deleted posts/comments
- **Behavioral analysis** - FBI-style profiling adapted from The-Profiler
  - Big Five (OCEAN) communication traits
  - Trolling/deception/sockpuppet risk indicators
- **Flagged content detection** - AI identifies harassment, hate speech, threats

#### Notifications
- **Public comment** - Transparency about crosslinks (optional)
- **Modmail alert** - For adversarial/hateful sources (optional)
- **Deleted content report** - Count of removed brigade comments

### Settings
| Setting | Description | Default |
|---------|-------------|---------|
| `enabled` | Enable brigade detection | `true` |
| `publicComment` | Post public comment on crosslinks | `true` |
| `modmailNotify` | Send modmail for hostile sources | `false` |
| `stickyComment` | Sticky the bot comment | `true` |
| `minimumLinkAge` | Wait time before notifying (minutes) | `5` |
| `aiProvider` | Tone classification provider | `none` |
| `geminiApiKey` | Your Gemini API key (BYOK) | `""` |
| `includeDeletedContent` | Check for deleted brigade comments | `true` |

---

## Farewell Hero

Responds to "I'm unsubscribing" posts with a witty statistical analysis of the user's activity.

### Features
- Pattern detection for farewell posts
- User activity analysis via wiki stats
- Delayed response to avoid appearing too eager
- Multiple response templates
- Bot disclosure footer

---

## Architecture

```
hub-bot-9000/
├── packages/
│   ├── common/                   # Shared utilities (@hub-bot/common)
│   │   └── src/
│   │       ├── redis.ts          # Redis helpers (getJson, setJson)
│   │       ├── rate-limiter.ts   # Configurable rate limiting
│   │       ├── ai-provider.ts    # Gemini BYOK integration
│   │       ├── pullpush.ts       # PullPush.io API client
│   │       ├── leaderboard.ts    # Hater tracking system
│   │       ├── user-analysis.ts  # Behavioral profiling
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
│   ├── brigade-sentinel/         # TotesMessenger revival
│   │   ├── src/
│   │   │   ├── main.tsx          # Devvit app entry
│   │   │   └── templates.ts      # Comment templates
│   │   └── devvit.yaml
│   │
│   └── farewell-hero/            # Unsubscribe responder
│       ├── src/
│       │   ├── main.tsx          # Devvit app entry
│       │   ├── detector.ts       # "I'm leaving" detection
│       │   ├── stats.ts          # Activity aggregation
│       │   └── responses.ts      # Response templates
│       └── devvit.yaml
│
├── scraper-service/              # Cloud Run service (Python)
│   ├── main.py                   # FastAPI app
│   └── scrapers/                 # Event scrapers
│
├── CLAUDE.md                     # AI development guide
├── FEATURE_BACKLOG.md            # Specs and ToS compliance
└── package.json                  # Workspace root
```

## Shared Package (@hub-bot/common)

All apps import shared utilities:

```typescript
import {
  // Rate limiting
  checkRateLimit,
  consumeRateLimit,

  // AI provider (BYOK)
  classifySubreddit,
  classifyPostTone,
  geminiCrosslinkSearch,

  // Leaderboard
  recordHater,
  getLeaderboard,
  enrichTopHatersWithOSINT,
  registerUserAlt,
  registerSubredditAlt,

  // User analysis
  analyzeUser,
  analyzeDeletedContent,
  getDeletedUserContent,

  // PullPush
  findCrosslinks,
  getDeletedComments,
  searchComments,
  searchSubmissions,

  // Utilities
  getJson,
  setJson,
  getBotFooter,

  // Types
  SourceClassification,
  AIProvider,
  BehavioralProfile,
} from '@hub-bot/common';
```

## Development

### Prerequisites
- Node.js 18+
- npm 9+
- [Devvit CLI](https://developers.reddit.com/docs/quickstart)

### Setup

```bash
# Clone the repo
git clone https://github.com/r-seattle-wa/hub-bot-9000.git
cd hub-bot-9000

# Install dependencies
npm install

# Build all packages
npm run build

# Login to Reddit
devvit login
```

### Working with Apps

```bash
# Build specific package
cd packages/haiku-sensei && npm run build

# Playtest an app
cd packages/brigade-sentinel
devvit playtest r/YourTestSubreddit

# View logs
devvit logs r/YourTestSubreddit

# Upload for production
devvit upload
devvit publish
```

## External APIs

| API | Used By | Auth | Purpose |
|-----|---------|------|---------|
| Reddit API | All apps | Devvit context | Core functionality |
| PullPush.io | brigade-sentinel | None (rate-limited) | Deleted content, crosslinks |
| Gemini Flash | All apps (optional) | BYOK (mod's key) | Tone classification, OSINT |

## BYOK Model

All AI features use **Bring Your Own Key** - moderators provide their own Gemini API key. This means:
- No cost to app developer
- Mods control their API usage
- Free tier available at [ai.google.dev](https://ai.google.dev)

## Privacy & Compliance

- **Bot disclosure** - All bot comments include disclosure footer
- **Public data only** - Only analyzes public posts/comments
- **No sensitive inference** - Does NOT derive health, politics, religion, sexual orientation
- **Opt-out support** - Users can block the bot to opt out
- **Rate limiting** - Prevents spam and API abuse

See [PRIVACY.md](PRIVACY.md) and [TERMS.md](TERMS.md) for details.

## Infrastructure (GCP)

Optional GCP infrastructure for logging, monitoring, and the scraper service.

```bash
cd infrastructure/terraform

# Setup
cp terraform.tfvars.example terraform.tfvars
# Edit with your project ID

terraform init
terraform plan
terraform apply
```

### Detection Metrics

The Terraform creates log-based metrics for monitoring suspicious activity:

| Metric | Description |
|--------|-------------|
| `hub-bot/hostile_crosslinks` | Hostile crosslinks detected |
| `hub-bot/brigade_patterns` | Brigading patterns |
| `hub-bot/osint_flagged_content` | OSINT flagged content |
| `hub-bot/sockpuppet_detections` | Sockpuppet detections |
| `hub-bot/mod_log_spam` | Mod log spam actions |

All suspicious activity is also routed to BigQuery for analysis.

See [infrastructure/README.md](infrastructure/README.md) for details.

---

## Credits

### Inspiration & References
- [TotesMessenger](https://reddit.com/u/TotesMessenger) - Original crosslink bot
- [The-Profiler](https://github.com/shitcoinsherpa/The-Profiler) - Behavioral analysis framework
- [sub-stats-bot](https://github.com/fsvreddit/sub-stats-bot) - Scheduler patterns
- [SeattleRedditBot](https://github.com/r-seattle-wa/SeattleRedditBot) - The original Seattle bot

### Built With
- [Devvit](https://developers.reddit.com) - Reddit Developer Platform
- [PullPush.io](https://pullpush.io) - Reddit content archival
- [Google Gemini](https://ai.google.dev/) - AI analysis (optional)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Build and test (`npm run build`)
4. Commit your changes
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/r-seattle-wa/hub-bot-9000/issues)
- **Reddit**: r/SeattleWA modmail for Seattle-specific questions
