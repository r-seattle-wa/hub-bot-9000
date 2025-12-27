# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Hub Bot 9000 is a Reddit Developer Platform (Devvit) app that provides automated community engagement features. It's built with TypeScript and uses Devvit's React-like component system.

## Tech Stack

- **Platform**: Reddit Devvit
- **Language**: TypeScript
- **UI**: Devvit Blocks (React-like TSX)
- **Storage**: Devvit Redis
- **External APIs**: National Weather Service API

## Key Commands

```bash
# Install dependencies
npm install

# Build
npm run build

# Lint
npm run lint

# Development with live reload
devvit playtest <subreddit-name>

# Upload to Reddit
devvit upload

# Publish new version
devvit publish

# Check logs
devvit logs <subreddit-name>
```

## Architecture Patterns

### Scheduler Jobs

Scheduled jobs use cron syntax and are registered in `main.tsx`:

```typescript
Devvit.addSchedulerJob({
  name: 'dailyPost',
  onRun: async (event, context) => {
    // Job logic
  },
});
```

Jobs are scheduled during app install/upgrade events in `installHandlers.ts`.

### Settings

App settings are defined in `src/config/settings.ts` and accessed via:

```typescript
const settings = await context.settings.getAll();
```

### Redis Storage

Use Devvit's built-in Redis for persistence:

```typescript
await context.redis.set('key', JSON.stringify(data));
const data = JSON.parse(await context.redis.get('key') ?? '{}');
```

### Components

Devvit uses a React-like syntax with custom elements. The JSX factory is `Devvit.createElement`, so every TSX file needs to import Devvit:

```tsx
import { Devvit } from '@devvit/public-api';

<vstack gap="medium" padding="medium">
  <text size="large">Title</text>
  <button onPress={handleClick}>Click me</button>
</vstack>
```

## Code Style

- Use TypeScript strict mode
- Prefer async/await over promises
- Use descriptive variable names
- Keep components small and focused
- Validate all external data
- Use ternary operators for conditional JSX (not `&&`)

## External API Notes

### National Weather Service API

- Base URL: `https://api.weather.gov`
- Seattle grid point: `SEW/123,68`
- Endpoint: `/gridpoints/{office}/{gridX},{gridY}/forecast`
- No API key required, but set User-Agent header

### Link Validation

All user-submitted URLs must be validated against the domain allowlist before storage. See `src/utils/linkValidator.ts`.

## Testing

Use `devvit playtest` with a test subreddit (r/SeattleModTests for this project).

## Deployment

1. Test thoroughly with `devvit playtest`
2. Upload with `devvit upload`
3. Publish with `devvit publish`
4. Install on target subreddit via app directory
