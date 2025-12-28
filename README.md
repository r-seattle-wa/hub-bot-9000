# Hub Bot 9000

A [Reddit Developer Platform (Devvit)](https://developers.reddit.com) app that automates community engagement through scheduled posts, weather forecasts, event aggregation, and curated community links.

**Originally built for [r/SeattleWA](https://reddit.com/r/SeattleWA)**, but designed to be adopted by any subreddit.

## Features

### 🗓️ Automated Event Aggregation
- **Multi-source scraping** via Cloud Run service
  - Eventbrite (JSON-LD extraction, no API key needed)
  - Ticketmaster API integration (optional)
  - Gemini AI for blocked sites (optional)
- **Smart deduplication** using fuzzy string matching
- **User-submitted events** with URL safety validation
- **Time period selector** - Today / 3 Days / Week
- **Source toggle** - All Events vs Community-only

### 📅 Scheduled Posts
- **Daily community threads** - configurable time, auto-posted
- **Weekly roundup posts** - configurable day and time
- Both can be enabled/disabled independently

### 🌤️ Weather Integration
- Fetches forecasts from the [National Weather Service API](https://www.weather.gov/documentation/services-web-api)
- 2-day forecast with weather emoji
- Moon phase display
- Configurable location (any US city via NWS grid point)

### 🔗 Community Hub
- **Interactive post UI** - tabbed interface for Events, Weather, Links
- **Curated event sources** - links to reputable local event listings
- **Community links** - Discord, wiki, rules, resources
- **Mod tools** - event approval queue, manual post triggers

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Reddit (Devvit Platform)                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │  Scheduler Jobs │  │  Interactive    │  │   Redis     │  │
│  │  - Daily post   │  │  Custom Post    │  │   Storage   │  │
│  │  - Weekly post  │  │  - Events tab   │  │  - Events   │  │
│  │  - Event fetch  │  │  - Weather tab  │  │  - Settings │  │
│  │  - Cleanup      │  │  - Links tab    │  │  - Cache    │  │
│  └────────┬────────┘  └─────────────────┘  └─────────────┘  │
│           │                                                  │
│           │ Fetch events (every 12 hours)                   │
└───────────┼─────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│              Cloud Run (Event Scraper Service)              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │   Eventbrite    │  │   Ticketmaster  │  │   Gemini    │  │
│  │   (JSON-LD)     │  │   (API)         │  │   (AI)      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
│                              │                               │
│                    ┌─────────▼─────────┐                    │
│                    │   Deduplication   │                    │
│                    │   & Aggregation   │                    │
│                    └───────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
hub-bot-9000/
├── src/                        # Devvit app (TypeScript)
│   ├── main.tsx                # Entry point, triggers, jobs
│   ├── components/
│   │   ├── CommunityPost.tsx   # Main interactive UI
│   │   ├── WeatherWidget.tsx   # Weather display
│   │   └── EventCalendar.tsx   # Event calendar
│   ├── services/
│   │   ├── eventService.ts     # Event CRUD + wiki reader
│   │   └── weatherService.ts   # NWS API
│   ├── scheduler/
│   │   ├── dailyPost.ts        # Daily post logic
│   │   ├── weeklyPost.ts       # Weekly post logic
│   │   └── installHandlers.ts  # Install/upgrade + fetch job
│   ├── config/settings.ts      # App settings schema
│   └── utils/linkValidator.ts  # URL safety validation
│
├── scraper-service/            # Cloud Run service (Python)
│   ├── main.py                 # FastAPI app
│   ├── scrapers/
│   │   └── gemini_scraper.py   # AI-powered scraping
│   ├── deduplication.py        # Fuzzy matching
│   ├── models.py               # Pydantic models
│   ├── Dockerfile              # Container config
│   └── cloudbuild.yaml         # GCP deployment
│
├── .github/workflows/
│   └── gitleaks.yml            # Secret scanning
└── .gitleaks.toml              # Gitleaks config
```

## Installation

### For Subreddit Moderators

1. Visit the Reddit Apps directory
2. Search for "Hub Bot 9000"
3. Click "Add to Community"
4. Configure settings in your subreddit's app settings

### For Developers

```bash
# Clone the repo
git clone https://github.com/r-seattle-wa/hub-bot-9000.git
cd hub-bot-9000

# Install dependencies
npm install

# Install Devvit CLI
npm install -g devvit

# Login to Reddit
devvit login

# Start development server
devvit playtest <your-test-subreddit>
```

### Deploying the Scraper Service (Optional)

The scraper service enables automated event aggregation from Eventbrite, Ticketmaster, and other sources.

```bash
cd scraper-service

# Set GCP project
gcloud config set project YOUR_PROJECT_ID

# Deploy (Eventbrite works without API keys)
gcloud run deploy event-scraper \
  --source . \
  --region us-west1 \
  --allow-unauthenticated

# Optional: Add Gemini for blocked sites
gcloud secrets create GOOGLE_API_KEY --data-file=-
gcloud run deploy event-scraper \
  --source . \
  --region us-west1 \
  --set-secrets "GOOGLE_API_KEY=GOOGLE_API_KEY:latest"
```

See [scraper-service/DEPLOY.template.md](scraper-service/DEPLOY.template.md) for detailed instructions.

## Configuration

All settings are configurable per-subreddit through the app settings UI:

| Setting | Description | Default |
|---------|-------------|---------|
| `enableDailyPost` | Post daily community thread | `true` |
| `dailyPostTime` | Time to post daily thread (UTC) | `15:00` |
| `enableWeeklyPost` | Post weekly roundup | `true` |
| `weeklyPostDay` | Day for weekly post | `Monday` |
| `enableWeather` | Include weather forecast | `true` |
| `weatherGridPoint` | NWS grid point | `SEW/123,68` (Seattle) |
| `weatherLocation` | Display name for location | `Seattle, WA` |
| `eventSources` | JSON array of event source links | See defaults |
| `enableUserEvents` | Allow user event submissions | `true` |
| `scraperUrl` | Cloud Run scraper URL (optional) | `""` |
| `communityLinks` | JSON array of community links | `[]` |

### Finding Your NWS Grid Point

1. Go to `https://api.weather.gov/points/{latitude},{longitude}`
2. Find your coordinates from Google Maps
3. The response includes `gridId` and `gridX,gridY`
4. Format: `{gridId}/{gridX},{gridY}` (e.g., `SEW/123,68`)

## Security

- **Secret scanning** - Gitleaks runs on all PRs and pushes
- **Input validation** - Location/state parameters validated with regex
- **URL allowlist** - User-submitted links restricted to trusted domains
- **Rate limiting** - 30 requests/minute on scraper API
- **HTTPS only** - All external URLs must use HTTPS

### Trusted Domains for User Links

- `reddit.com`, `redd.it`
- `eventbrite.com`, `meetup.com`
- `facebook.com` (events)
- Government domains (`.gov`)
- Additional domains configurable per-subreddit

## Background

This project is the spiritual successor to [SeattleRedditBot](https://github.com/r-seattle-wa/SeattleRedditBot), a Python/PRAW bot that posted daily community threads with weather, events, and community-generated content. That bot required external hosting (AWS Fargate) and ongoing maintenance.

**Hub Bot 9000** reimagines this as a native Reddit app:
- **No external hosting required** - runs on Reddit's infrastructure
- **Interactive UI** - not just text posts, but clickable widgets
- **Community-configurable** - any subreddit can install and customize
- **Modern stack** - TypeScript, React-like components, built-in Redis

## Credits

### Predecessor Projects
- [SeattleRedditBot](https://github.com/r-seattle-wa/SeattleRedditBot) - The original Python bot

### Inspiration & Code References
- [Aye Aye Calendar](https://github.com/jackmg2/RedditApps/tree/main/Calendar) - Event calendar UI
- [Community Links](https://github.com/jackmg2/RedditApps/tree/main/Linker) - Link board patterns
- [sub-stats-bot](https://github.com/fsvreddit/sub-stats-bot) - Scheduler patterns

### Built With
- [Devvit](https://developers.reddit.com) - Reddit Developer Platform
- [National Weather Service API](https://www.weather.gov/documentation/services-web-api) - Weather data
- [Google Gemini](https://ai.google.dev/) - AI-powered scraping (optional)
- [FastAPI](https://fastapi.tiangolo.com/) - Scraper service framework

## Legal

- [Terms of Service](TERMS.md)
- [Privacy Policy](PRIVACY.md)

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

**Note**: Gitleaks will scan your PR for secrets. Ensure no API keys or credentials are committed.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/r-seattle-wa/hub-bot-9000/issues)
- **Reddit**: r/SeattleWA modmail for Seattle-specific questions
