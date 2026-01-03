# Hub Bot 9000

A suite of [Reddit Developer Platform (Devvit)](https://developers.reddit.com) apps for community engagement, moderation, and entertainment.

**Originally built for [r/SeattleWA](https://reddit.com/r/SeattleWA)**, but designed to be adopted by any subreddit.

## Apps

| App | Purpose | Status |
|-----|---------|--------|
| [community-hub](#community-hub) | Community dashboard with events, weather, and links | Ready |
| [haiku-sensei](#haiku-sensei) | Detects accidental 5-7-5 haikus in comments | Ready |
| [brigade-sentinel](#brigade-sentinel) | Cross-subreddit link alerts with hater tracking | Ready |
| [farewell-hero](#farewell-hero) | Witty responses + satirical tributes (!tribute) | Ready |
| [hub-widget](#hub-widget) | Bot activity feed showing all hub-bot events | Ready |

---

## Community Hub

A full-featured community dashboard as a Reddit Custom Post Type with tabbed navigation.

### Features

#### Tabbed Interface
- **Events** - Upcoming community events with time period filtering
- **Weather** - Current forecast via weather.gov (US only)
- **Links** - Event calendars and community resources

#### Scheduled Posts
- **Daily Thread** - Auto-generated community discussion thread
- **Weekly Thread** - Weekly roundup with weather outlook and events

#### User Event Submissions
- Community members can submit events via in-post form
- Link validation (only trusted domains)
- Mod approval queue before public display

### Settings

| Setting | Description |
|---------|-------------|
| `enableDailyPost` | Auto-post daily community thread |
| `enableWeeklyPost` | Auto-post weekly thread |
| `enableWeather` | Include weather forecast |
| `weatherGridPoint` | NWS grid point (e.g., SEW/123,68) |
| `weatherLocation` | Display name (e.g., "Portland, OR") |
| `eventSources` | JSON array of event calendar links |
| `communityLinks` | JSON array of community resource links |
| `headerTitle` | Hub title displayed in header |
| `headerEmoji` | Emoji displayed in header |

### Deployment

```bash
cd packages/community-hub
devvit upload
devvit install r/YourSubreddit

# Then use subreddit menu: "Create Community Hub"
```

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
Track hostile crosslinks with dual leaderboards:

**Subreddit Leaderboard**
- Tracks which subreddits most frequently link with hostile intent
- Alt subreddit mapping (e.g., r/ExampleCirclejerk -> r/Example)

**User Leaderboard**
- Tracks individual users who post hostile crosslinks
- Alt account mapping for serial offenders
- Mod log integration (+2 per removal, +6 per ban)
- OSINT enrichment via deleted content analysis

**Score Formula:**
```
Score = adversarial + (hateful x 3) + (mod log spam x 2) + (deleted content flags x 2) + (tributes x 0.5)
```

#### Hater Achievement System
Xbox-style achievements for dedicated haters:
- **27 achievements** across 5 tiers (Bronze -> Diamond)
- **AI-generated roasts** - Personalized mockery using Gemini
- **Talking point detection** - Tracks common complaints/memes
- **Wiki debunk links** - Links to evidence pages

| Tier | Score | Example Achievement |
|------|-------|---------------------|
| Bronze | 5-9 | Casual Complainer |
| Silver | 10-24 | Serial Brigader |
| Gold | 25-49 | Professional Hater |
| Platinum | 50-99 | Legendary Salt Lord |
| Diamond | 100+ | Transcendent Malcontent |

#### Traffic Spike Detection
Real-time detection of unusual comment velocity - potential early warning for brigades.
- Configurable threshold (default: 10 comments in 5 minutes)
- Modmail alerts when spike occurs
- Hub-widget integration

#### Notifications
- **Public comment** - Transparency about crosslinks (optional)
- **Modmail alert** - For adversarial/hateful sources (optional)
- **Traffic spike alert** - When comment velocity exceeds threshold

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
| `detectTrafficSpikes` | Enable traffic spike detection | `true` |
| `velocityThreshold` | Comments per 5 min to trigger alert | `10` |
| `enableAchievements` | Enable hater achievement comments | `true` |

---

## Farewell Hero

Responds to "I'm unsubscribing" posts with a witty statistical analysis of the user's activity. Also includes the **Tribute** feature for generating satirical homages to users and subreddits.

### Farewell Features
- Pattern detection for farewell posts
- User activity analysis
- 5 sarcasm levels (Polite → Freakout)
- Tone matching to user's mood
- Political complaint detection with wiki survey links
- Best post/comment showcase
- Hater leaderboard integration

### Tribute Feature

Satirical tribute generator that channels the essence of subreddits and users. Spiritual successor to [Seattle-Simulator](https://github.com/r-seattle-wa/Seattle-Simulator).

**Commands:**
```
!tribute              # Tribute to default subreddit
!tribute r/Seattle    # Tribute to specific subreddit
!tribute u/username   # Tribute to specific user
"what would u/user say about this?"  # Natural language
```

**AI Providers:**
- **Groq** (primary) - Free tier, Llama 3.1-8b-instant
- **Gemini** (fallback) - BYOK

**Leaderboard Integration:** Each tribute request adds +0.5 hater points (playful rivalry).

### Sarcasm Levels

| Level | Style |
|-------|-------|
| POLITE | "Thank you for being part of our community." |
| NEUTRAL | "Activity summary: X contributions over Y days." |
| SNARKY | "We will definitely notice your *checks notes* 2 contributions." |
| ROAST | "Your 2 contributions will be missed. By literally no one." |
| FREAKOUT | "OH NO! NOT SOMEONE WITH 2 CONTRIBUTIONS!" |

---

## Hub Widget

Bot activity feed showing events from all hub-bot apps as a Reddit Custom Post Type.

### Features
- **Live event feed** - Shows recent events from all bots
- **Color-coded events** - Each event type has distinct icon/color
- **Auto-refresh** - Updates every 60 seconds
- **Wiki-based storage** - Events stored in shared wiki page

### Event Types

| Type | Icon | Color |
|------|------|-------|
| Brigade Alert | `!` | Red |
| Haiku Detection | `*` | Teal |
| Farewell | `~` | Yellow |
| Court Docket | `#` | Green |
| Traffic Spike | `^` | Orange |
| Community Event | `@` | Purple |
| System | `i` | Light green |

### Deployment

```bash
cd packages/hub-widget
devvit upload
devvit install r/YourSubreddit

# Then use subreddit menu: "Create Hub Bot Events Widget"
```

---

## Architecture

```
hub-bot-9000/
├── packages/
│   ├── common/                   # Shared utilities (@hub-bot/common)
│   │   └── src/
│   │       ├── redis.ts          # Redis helpers
│   │       ├── rate-limiter.ts   # Configurable rate limiting
│   │       ├── ai-provider.ts    # Gemini BYOK integration
│   │       ├── pullpush.ts       # PullPush.io API client
│   │       ├── leaderboard.ts    # Hater tracking system
│   │       ├── tribute.ts        # Tribute generation
│   │       ├── achievements.ts   # Achievement system
│   │       ├── events-feed.ts    # Cross-app event feed
│   │       ├── wiki.ts           # Wiki storage paths
│   │       └── types.ts          # Shared types
│   │
│   ├── community-hub/            # Community dashboard
│   │   ├── src/
│   │   │   ├── main.tsx          # Devvit app entry
│   │   │   ├── components/       # UI components
│   │   │   ├── scheduler/        # Daily/weekly post jobs
│   │   │   └── services/         # Weather, events
│   │   └── devvit.yaml
│   │
│   ├── haiku-sensei/             # Haiku detection bot
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── detector.ts
│   │   │   └── syllables.ts
│   │   └── devvit.yaml
│   │
│   ├── brigade-sentinel/         # TotesMessenger revival
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   └── templates.ts
│   │   └── devvit.yaml
│   │
│   ├── farewell-hero/            # Unsubscribe responder
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── detector.ts
│   │   │   └── responses.ts
│   │   └── devvit.yaml
│   │
│   └── hub-widget/               # Bot activity feed
│       ├── src/
│       │   └── main.tsx
│       └── devvit.yaml
│
├── scraper-service/              # Cloud Run service (Python)
│   └── main.py
│
└── infrastructure/               # GCP Terraform
    └── terraform/
```

## Wiki Storage

All apps use standardized wiki paths under `hub-bot-9000/`:

| Path | Purpose |
|------|---------|
| `hub-bot-9000/events-feed` | Cross-app bot activity feed |
| `hub-bot-9000/opt-out` | User opt-out list |
| `hub-bot-9000/hater-leaderboard` | Hater scores |
| `hub-bot-9000/user-achievements` | Achievement tracking |
| `hub-bot-9000/community-events` | User-submitted events |

---

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
cd packages/community-hub && npm run build

# Playtest an app
cd packages/brigade-sentinel
devvit playtest r/YourTestSubreddit

# View logs
devvit logs r/YourTestSubreddit

# Upload for production
devvit upload
devvit publish
```

---

## External APIs

| API | Used By | Auth | Purpose |
|-----|---------|------|---------|
| Reddit API | All apps | Devvit context | Core functionality |
| weather.gov | community-hub | None | Weather forecasts (US) |
| PullPush.io | brigade-sentinel | None (rate-limited) | Deleted content, crosslinks |
| Groq API | farewell-hero | BYOK (free tier) | Tribute generation (Llama 3.1) |
| Gemini Flash | All apps (optional) | BYOK | AI classification, tribute fallback |

## BYOK Model

All AI features use **Bring Your Own Key** - moderators provide their own Gemini API key:
- No cost to app developer
- Mods control their API usage
- Free tier available at [ai.google.dev](https://ai.google.dev)

---

## Privacy & Compliance

- **Bot disclosure** - All bot comments include disclosure footer
- **Public data only** - Only analyzes public posts/comments
- **No sensitive inference** - Does NOT derive health, politics, religion, etc.
- **Opt-out support** - Users can block the bot to opt out
- **Rate limiting** - Prevents spam and API abuse

See [PRIVACY.md](PRIVACY.md) and [TERMS.md](TERMS.md) for details.

---

## License

MIT License - see [LICENSE](LICENSE) for details.

## Community

- **Discord**: [discord.gg/seattle](https://discord.gg/seattle) - Seattle Discord community
- **Subreddits**: r/Seattle, r/SeattleWA, and others
- **Issues**: [GitHub Issues](https://github.com/r-seattle-wa/hub-bot-9000/issues)
