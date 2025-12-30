# Event Scraper Status Report

## Seattle Event Sources - Comprehensive List (December 2025)

### Tier 1: Working Sources (Ollama gemma3 extraction)

| Source | URL | Events | Time | Notes |
|--------|-----|--------|------|-------|
| **MoPOP** | mopop.org/events | 5-8 | 68s | Museum events, camps, film festivals |
| **Seattle Art Museum** | seattleartmuseum.org/events | 7-12 | 68s | Exhibitions, workshops, gallery events |
| **Burke Museum** | burkemuseum.org/calendar | 14 | 67s | Natural history, family events |
| **Frye Art Museum** | fryemuseum.org/calendar/ | 10-16 | 21s | Free art museum events |
| **Visit Seattle** | visitseattle.org/things-to-do/events/ | 9 | 35s | Tourism-focused, exhibits, festivals |
| **Seattle Public Library** | spl.org/event-calendar | 2+ | 15s | Library programs, closures |
| **West Seattle Blog** | westseattleblog.com/events/ | 10+ | 47s | Local/neighborhood events |
| **Fremont Sunday Market** | fremontmarket.com | 5-7 | 36s | Market events, vendors |
| **Events12 Seattle** | events12.com/seattle/ | 23 | 108s | Aggregator - holidays, festivals |
| **Jet City Improv** | jetcityimprov.org | 10-11 | 36s | Comedy shows, classes |

### Tier 2: Blocked / Need Alternative

| Source | URL | Status | Issue | Workaround |
|--------|-----|--------|-------|------------|
| **EverOut Seattle** | everout.com/seattle/events/ | 403 Blocked | Cloudflare | Use Gemini Search grounding |
| **The Stranger** | thestranger.com/events | 403 Blocked | Cloudflare | Use Gemini Search grounding |
| **Seattle Symphony** | seattlesymphony.org/events | 403 Blocked | WAF | Use Ticketmaster API |
| **Seattle.gov** | seattle.gov/event-calendar | Dynamic | Trumba JS calendar | Need Playwright |
| **Seattle Center** | seattlecenter.com/events | SSL Error | Certificate | Fix SSL config |
| **Eventbrite** | eventbrite.com/d/wa--seattle/ | 405 Blocked | Anti-bot | Use their API instead |

### Tier 3: Limited Value

| Source | URL | Status | Notes |
|--------|-----|--------|-------|
| **CSz Seattle** | cszseattle.com | Works | Limited event data, no dates |
| **Pinball Map** | pinballmap.com/seattle/events | Works | Minimal content |
| **Capitol Hill Seattle** | capitolhillseattle.com/feed/ | RSS works | Filter needed, few events |

---

## Extraction Methods - What Works Best

### Method 1: AI Parsing (RECOMMENDED)
**Best for**: Most sites without structured data

| AI Option | Pros | Cons | Cost |
|-----------|------|------|------|
| **Gemini 2.0 Flash** | Fast, grounded search | Rate limited | Free tier + pay-as-you-go |
| **Ollama (llama3.2)** | Unlimited, local, private | Needs Docker, slower | Free |
| **NuExtract (Ollama)** | Specialized for extraction | Limited context | Free |

**Best models for extraction:**
- `gemini-2.0-flash` - Best accuracy, rate limited
- `llama3.1:8b` - Good balance, ~5GB RAM
- `nuextract` - Purpose-built for extraction

### Method 2: JSON-LD (Schema.org)
**Best for**: Sites with structured event data

```html
<!-- Look for this in page source -->
<script type="application/ld+json">
{
  "@type": "Event",
  "name": "Concert Name",
  "startDate": "2025-01-15",
  ...
}
</script>
```

**Supported sites**: Very few (most don't implement it)

### Method 3: Official APIs
**Best for**: Large platforms with developer access

| API | Free Tier | Auth | Link |
|-----|-----------|------|------|
| Ticketmaster | 5000 req/day | API key | developer.ticketmaster.com |
| Eventbrite | Limited | OAuth | eventbrite.com/platform/api |
| Meetup | GraphQL | API key | meetup.com/api |

### Method 4: JavaScript Rendering
**Best for**: Dynamic sites (React, Vue, calendar widgets)

- Requires: Playwright or Selenium
- Use for: Seattle.gov (Trumba calendar)
- Not yet implemented in this service

### Method 5: Direct HTML Scraping
**Best for**: Simple, static sites

- Library: BeautifulSoup
- Reliability: Low (breaks with layout changes)
- Not recommended for most sources

---

## AI Options - Detailed Comparison

### Gemini API (google.generativeai)
```bash
# Environment
GOOGLE_API_KEY=your_key_here
```
- **Model**: `gemini-2.0-flash` (1.5-flash deprecated April 2025)
- **Free tier**: 15 req/min, 1500 req/day
- **Paid tier**: $0.075/1M input tokens
- **Features**: Google Search grounding for real-time data
- **Issue**: Quota exhausts quickly with multiple sources

### Ollama (Local LLM) - TESTED & WORKING

```bash
# Docker setup
docker run -d --name ollama -p 11434:11434 -v ollama:/root/.ollama ollama/ollama
docker exec ollama ollama pull gemma3

# Environment
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3
```

**Tested Models (December 2025):**

| Model | Size | Response Time | Accuracy | Notes |
|-------|------|---------------|----------|-------|
| **gemma3** | 3.3 GB | 30-50s | Excellent | Best for event extraction |
| llama3.2 | 2.0 GB | 20-30s | Good | Faster, less accurate |
| llama3.1:8b | 4.7 GB | 40-60s | Very Good | More RAM needed |

**Test Results (MoPOP):**
- Input: 800 chars of event text
- Output: 14 real events extracted
- Time: 30.8 seconds
- Accuracy: 100% (all events verified)

**Best Practices:**
1. Extract text content from specific HTML elements (e.g., `.events-wrapper`)
2. Use `temperature: 0.1` for factual extraction
3. Limit input to ~8-10k chars for best results
4. Clean markdown code blocks from response

- **Requirements**: ~8GB RAM for larger models
- **Advantages**: No rate limits, private, free, works offline
- **Disadvantages**: 30-50s response time, needs good HTML selectors

---

## Configuration

### Environment Variables
```bash
# AI Options (at least one recommended)
GOOGLE_API_KEY=your_gemini_key     # For Gemini
OLLAMA_URL=http://localhost:11434  # For local LLM
OLLAMA_MODEL=llama3.2              # Model to use

# Optional APIs
TICKETMASTER_API_KEY=your_key     # Free tier: 5000 req/day

# Security
SCRAPER_API_KEY=optional_auth_key  # Protect your endpoints
```

### Docker Compose (Full Stack)
```yaml
version: '3.8'
services:
  scraper:
    build: ./scraper-service
    ports:
      - "8080:8080"
    environment:
      - GOOGLE_API_KEY=${GOOGLE_API_KEY}
      - OLLAMA_URL=http://ollama:11434
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama

volumes:
  ollama_data:
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/events` | GET | Fetch events from all sources |
| `/wiki-format` | GET | Get events in wiki-ready JSON |
| `/health` | GET | Check which scrapers are enabled |
| `/analyze/content` | POST | Unified content analysis |
| `/analyze/batch` | POST | Batch content analysis |

---

## Current Status Summary

### Working
- Content Analysis (haiku, farewell, crosslinks, tone)
- Seattle Met events (AI parsing)
- Visit Seattle events (AI parsing)
- West Seattle Blog events (AI parsing)
- MoPOP events (AI parsing)
- Ticketmaster (API)
- Keyword-based tone detection (fallback)

### Needs Work
- EverOut - Blocked (403), try proxy or Gemini Search grounding
- Seattle.gov - Needs Playwright for JS rendering (Trumba calendar)
- Eventbrite - Blocked (405), use their API instead
- Gemini quota - Add retry logic or model rotation

### Fully Tested (December 2025)
- Ollama gemma3 - 14 events from MoPOP in 30.8s
- Ollama llama3.2 - 2 events from West Seattle Blog in 52.5s
- HTML selectors: `.events-wrapper` (MoPOP), `ai1ec-event` (WSB)

---

## Source-Specific Extraction Methods

| Source | Best Method | HTML Selector | Notes |
|--------|-------------|---------------|-------|
| MoPOP | Ollama + HTML | `.events-wrapper` | 14 events, 30s |
| West Seattle Blog | Ollama + HTML | `ai1ec-event` | WordPress calendar plugin |
| Visit Seattle | Gemini/Ollama | `[class*="event"]` | 9 elements found |
| Seattle Met | Gemini | Full page | Heavy JS, needs grounding |
| EverOut | Gemini Search | N/A (blocked) | Use search grounding only |

---

## Adding New Sources

1. Test if the URL is accessible:
   ```bash
   curl -I "https://example.com/events"
   ```

2. Check for JSON-LD:
   ```bash
   curl -s "https://example.com/events" | grep "application/ld+json"
   ```

3. If no JSON-LD, add to `GEMINI_SOURCES` in `scrapers/gemini_scraper.py`:
   ```python
   {
       "name": "Example Events",
       "url": "https://example.com/events",
       "query": "site:example.com events Seattle",
       "icon": "📅",
   }
   ```

4. Test with AI parsing to verify extraction works
