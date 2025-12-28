# Security & Best Practices Review

## Scraper Service (Python/FastAPI)

### Issues Found & Fixes

| Issue | Severity | Status |
|-------|----------|--------|
| CORS allow_origins=["*"] | Medium | FIXED - Restrict to Cloud Run/Devvit |
| No input sanitization on location/state | Medium | FIXED - Added regex validation |
| No rate limiting | Low | FIXED - Added slowapi rate limiter |
| No API authentication | Medium | FIXED - Added optional API key |
| Using print() instead of logging | Low | FIXED - Using proper logging |
| MD5 for ID generation | Low | OK - Not used for security |

### Recommended Environment Variables

```bash
# Required
GOOGLE_API_KEY=your_gemini_api_key

# Optional
TICKETMASTER_API_KEY=your_ticketmaster_key
SCRAPER_API_KEY=your_secret_key  # For API authentication
ALLOWED_ORIGINS=https://reddit.com,https://devvit.reddit.com
```

## Devvit App (TypeScript)

### Issues Found & Fixes

| Issue | Severity | Status |
|-------|----------|--------|
| URL validation exists | N/A | OK - Using allowlist |
| Input length limits | N/A | OK - Truncating titles/descriptions |
| XSS in user content | Low | OK - Devvit escapes output |
| Wiki page permissions | Medium | CHECK - Ensure wiki is mod-only |

### URL Allowlist (linkValidator.ts)
- reddit.com, redd.it
- eventbrite.com, meetup.com
- facebook.com (events)
- .gov domains

## Data Flow Security

```
Cloud Run Scraper          Reddit Wiki              Devvit App
     |                         |                        |
     | 1. Fetch events         |                        |
     |------------------------>|                        |
     |   (mod-only write)      |                        |
     |                         |                        |
     |                         | 2. Read events         |
     |                         |<-----------------------|
     |                         |   (public read OK)     |
```

### Wiki Page Security
- Page: `hub-bot-events`
- Should be: Listed=false, mod-only edit
- Content: JSON only, no executable code

## Recommendations

1. **API Key for Scraper** - Add `X-API-Key` header validation
2. **Rate Limiting** - Max 10 requests/minute per IP
3. **Input Validation** - Alphanumeric only for location/state
4. **Logging** - Use structured logging, no PII
5. **Error Handling** - Generic errors to client, detailed to logs
