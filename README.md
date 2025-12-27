# Hub Bot 9000

A [Reddit Developer Platform (Devvit)](https://developers.reddit.com) app that automates community engagement through scheduled posts, weather forecasts, event calendars, and curated community links.

**Originally built for [r/SeattleWA](https://reddit.com/r/SeattleWA)**, but designed to be adopted by any subreddit.

## Background

This project is the spiritual successor to [SeattleRedditBot](https://github.com/r-seattle-wa/SeattleRedditBot), a Python/PRAW bot that posted daily community threads with weather, events, and community-generated content. That bot required external hosting (AWS Fargate) and ongoing maintenance.

**Hub Bot 9000** reimagines this as a native Reddit app using the Devvit platform:
- **No external hosting required** - runs entirely on Reddit's infrastructure
- **Interactive UI** - not just text posts, but clickable calendars and widgets
- **Community-configurable** - any subreddit can install and customize it
- **Modern stack** - TypeScript, React-like components, built-in Redis storage

## Features

### Scheduled Posts
- **Daily community threads** - configurable time, auto-posted
- **Weekly roundup posts** - configurable day and time
- Both can be enabled/disabled independently

### Weather Integration
- Fetches forecasts from the [National Weather Service API](https://www.weather.gov/documentation/services-web-api)
- 2-day forecast with weather emoji
- Moon phase display
- Configurable location (any US city via NWS grid point)

### Event Calendar
- **Curated event sources** - links to reputable local event listings
- **Mod-managed events** - moderators can add featured events
- **User-submitted events** - community members can submit events (with URL safety validation)
- Interactive calendar UI based on [Aye Aye Calendar](https://github.com/jackmg2/RedditApps/tree/main/Calendar)

### Community Links
- Configurable links section (Discord, wiki, rules, resources)
- Click-through to external event calendars

## Installation

### For Subreddit Moderators

1. Visit the Reddit Apps directory (coming soon)
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

## Configuration

All settings are configurable per-subreddit through the app settings UI:

| Setting | Description | Default |
|---------|-------------|---------|
| `enableDailyPost` | Post daily community thread | `true` |
| `dailyPostTime` | Time to post daily thread (UTC) | `15:00` |
| `enableWeeklyPost` | Post weekly roundup | `true` |
| `weeklyPostDay` | Day for weekly post | `Monday` |
| `weeklyPostTime` | Time for weekly post (UTC) | `15:00` |
| `enableWeather` | Include weather forecast | `true` |
| `weatherGridPoint` | NWS grid point | `SEW/123,68` (Seattle) |
| `weatherLocation` | Display name for location | `Seattle, WA` |
| `eventSources` | JSON array of event source links | See defaults |
| `enableUserEvents` | Allow user event submissions | `true` |
| `communityLinks` | JSON array of community links | `[]` |

### Finding Your NWS Grid Point

1. Go to https://api.weather.gov/points/{latitude},{longitude}
2. Find your coordinates from Google Maps
3. The response includes `gridId` and `gridX,gridY`
4. Format: `{gridId}/{gridX},{gridY}` (e.g., `SEW/123,68`)

## Architecture

```
src/
├── main.tsx                # Devvit entry point, triggers, scheduled jobs
├── scheduler/
│   ├── dailyPost.ts        # Daily post generation logic
│   ├── weeklyPost.ts       # Weekly post generation logic
│   └── installHandlers.ts  # App install/upgrade handlers
├── services/
│   ├── weatherService.ts   # NWS API integration
│   ├── moonService.ts      # Moon phase calculations
│   └── eventService.ts     # Event storage (Redis)
├── components/
│   ├── CommunityPost.tsx   # Main interactive post UI
│   ├── EventCalendar.tsx   # Event calendar widget
│   ├── WeatherWidget.tsx   # Weather display component
│   └── UserEventForm.tsx   # User event submission form
├── utils/
│   ├── linkValidator.ts    # URL safety validation
│   └── dateUtils.ts        # Date/time utilities
├── config/
│   └── settings.ts         # App settings schema
└── types/
    └── index.ts            # TypeScript interfaces
```

## Link Safety

User-submitted event links are validated against an allowlist of trusted domains:

- `reddit.com`, `redd.it`
- `eventbrite.com`, `meetup.com`
- `facebook.com/events`
- Government domains (`.gov`)
- Additional domains configurable per-subreddit

## Legal

- [Terms of Service](TERMS.md)
- [Privacy Policy](PRIVACY.md)

## Credits

### Predecessor Projects
- [SeattleRedditBot](https://github.com/r-seattle-wa/SeattleRedditBot) - The original Python bot this project replaces

### Inspiration & Code References
- [Aye Aye Calendar](https://github.com/jackmg2/RedditApps/tree/main/Calendar) - Event calendar UI patterns
- [Community Links](https://github.com/jackmg2/RedditApps/tree/main/Linker) - Link board patterns
- [sub-stats-bot](https://github.com/fsvreddit/sub-stats-bot) - Scheduler and install event patterns

### Built With
- [Devvit](https://developers.reddit.com) - Reddit Developer Platform
- [National Weather Service API](https://www.weather.gov/documentation/services-web-api) - Weather data

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/r-seattle-wa/hub-bot-9000/issues)
- **Reddit**: r/SeattleWA modmail for Seattle-specific questions
