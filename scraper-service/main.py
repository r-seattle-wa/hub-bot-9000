"""
Hub Bot 9000 - Event Scraper & Content Analyzer

Services:
1. Event Aggregation: Eventbrite, Ticketmaster, Gemini AI scraping
2. Content Analysis: Unified detection (haiku, farewell, crosslinks, tone)
3. Cloud Logging: Structured events for GCP metrics

Integration Point: Use scraper_url in Devvit app settings
"""
import os
import hashlib
import json
import logging
import re
from datetime import datetime, timedelta
from typing import Optional
import asyncio

from fastapi import FastAPI, Query, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from cachetools import TTLCache
import httpx
from bs4 import BeautifulSoup

from models import Event
from deduplication import deduplicate_events

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Hub Bot 9000 - Event Scraper & Content Analyzer",
    version="1.0.0",
    docs_url="/docs" if os.getenv("ENABLE_DOCS", "false").lower() == "true" else None,
)

# CORS - restrict to known origins in production
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "").split(",") if os.getenv("ALLOWED_ORIGINS") else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# In-memory cache with 1 hour TTL
event_cache = TTLCache(maxsize=100, ttl=3600)

# Simple rate limiting (in production, use Redis-backed rate limiter)
request_counts: dict[str, list[float]] = {}
RATE_LIMIT = int(os.getenv("RATE_LIMIT", "30"))  # requests per minute
RATE_WINDOW = 60  # seconds

# HTTP headers for web requests
HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/json,application/xhtml+xml",
}

# API Keys from environment
TICKETMASTER_API_KEY = os.getenv("TICKETMASTER_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")  # For Gemini scraping
SCRAPER_API_KEY = os.getenv("SCRAPER_API_KEY")  # Optional API key for authentication

# Initialize Gemini scraper if API key is available
gemini_scraper = None
if GOOGLE_API_KEY:
    try:
        from scrapers.gemini_scraper import fetch_events_with_gemini
        gemini_scraper = fetch_events_with_gemini
        logger.info("Gemini scraper enabled")
    except ImportError as e:
        logger.warning(f"Gemini scraper not available: {e}")

# Initialize direct web scrapers (no AI needed)
try:
    from scrapers.web_scrapers import fetch_all_seattle_events
    web_scrapers_enabled = True
    logger.info("Direct web scrapers enabled")
except ImportError as e:
    web_scrapers_enabled = False
    logger.warning(f"Web scrapers not available: {e}")

# Ollama local LLM support
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3")

# Gemini event scraper (primary - fast, uses search grounding)
gemini_event_scraper = None
try:
    from scrapers.gemini_event_scraper import fetch_events_single_query, check_gemini_available
    if check_gemini_available():
        gemini_event_scraper = fetch_events_single_query
        logger.info("Gemini event scraper enabled (primary)")
except ImportError as e:
    logger.warning(f"Gemini event scraper not available: {e}")

# Ollama multi-source scraper (fallback for local dev)
multi_source_scraper = None
ollama_available = False
try:
    from scrapers.multi_source_scraper import fetch_all_events as fetch_multi_source_events
    from scrapers.multi_source_scraper import check_ollama_available, get_source_list
    ollama_available = check_ollama_available()
    if ollama_available:
        multi_source_scraper = fetch_multi_source_events
        logger.info(f"Ollama scraper enabled (fallback)")
except ImportError as e:
    pass  # Ollama is optional

# Input validation patterns
LOCATION_PATTERN = re.compile(r'^[a-zA-Z\s\-]{1,50}$')
STATE_PATTERN = re.compile(r'^[A-Za-z]{2}$')


def check_rate_limit(request: Request):
    """Simple in-memory rate limiting."""
    client_ip = request.client.host if request.client else "unknown"
    now = datetime.now().timestamp()

    if client_ip not in request_counts:
        request_counts[client_ip] = []

    # Clean old entries
    request_counts[client_ip] = [t for t in request_counts[client_ip] if now - t < RATE_WINDOW]

    if len(request_counts[client_ip]) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    request_counts[client_ip].append(now)


def verify_api_key(request: Request):
    """Optional API key verification."""
    if not SCRAPER_API_KEY:
        return  # No API key configured, allow all requests

    api_key = request.headers.get("X-API-Key")
    if api_key != SCRAPER_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


def validate_location(location: str) -> str:
    """Validate and sanitize location input."""
    location = location.strip()
    if not LOCATION_PATTERN.match(location):
        raise HTTPException(status_code=400, detail="Invalid location format")
    return location


def validate_state(state: str) -> str:
    """Validate and sanitize state input."""
    state = state.strip().upper()
    if not STATE_PATTERN.match(state):
        raise HTTPException(status_code=400, detail="Invalid state format")
    return state


@app.get("/")
async def root():
    return {"service": "Seattle Event Scraper", "status": "running"}


@app.get("/events")
async def get_events(
    request: Request,
    days: int = Query(default=3, ge=1, le=14, description="Number of days ahead to fetch"),
    location: str = Query(default="Seattle", description="City name"),
    state: str = Query(default="WA", description="State code"),
    refresh: bool = Query(default=False, description="Force refresh cache")
):
    """
    Fetch aggregated events from all sources.
    Returns deduplicated events for the next N days.
    """
    # Security checks
    check_rate_limit(request)
    verify_api_key(request)

    # Validate inputs
    location = validate_location(location)
    state = validate_state(state)

    cache_key = f"{location}:{state}:{days}"

    # Check cache unless refresh requested
    if not refresh and cache_key in event_cache:
        return {"events": event_cache[cache_key], "cached": True}

    # Fetch from all sources concurrently
    all_events = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        tasks = []

        # Eventbrite - JSON-LD extraction (no API key needed!)
        tasks.append(fetch_eventbrite_jsonld(client, location, state, days))

        # Ticketmaster API (optional - needs API key)
        if TICKETMASTER_API_KEY:
            tasks.append(fetch_ticketmaster_events(client, location, state, days))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, list):
                all_events.extend(result)
            elif isinstance(result, Exception):
                logger.error(f"Scraper error: {type(result).__name__}")

    # Gemini event scraper with search grounding (primary - fast)
    if gemini_event_scraper and location.lower() == "seattle":
        try:
            gemini_events = await gemini_event_scraper(location, days)
            all_events.extend(gemini_events)
            logger.info(f"Gemini events: added {len(gemini_events)} events")
        except Exception as e:
            logger.error(f"Gemini event scraper error: {type(e).__name__}: {e}")
    
    # Always run web scrapers for Seattle to maximize coverage
    if web_scrapers_enabled and location.lower() == "seattle":
        try:
            web_events = await fetch_all_seattle_events(days)
            all_events.extend(web_events)
            logger.info(f"Web scrapers: added {len(web_events)} events from EverOut/MoPOP/SeattleMet/Seattle.gov")
        except Exception as e:
            logger.error(f"Web scraper error: {type(e).__name__}: {e}")

    # Ollama multi-source (for local dev without API key) - fallback only
    if not all_events and multi_source_scraper and location.lower() == "seattle":
        try:
            ollama_events = await multi_source_scraper()
            all_events.extend(ollama_events)
            logger.info(f"Ollama fallback: added {len(ollama_events)} events")
        except Exception as e:
            logger.error(f"Ollama scraper error: {type(e).__name__}: {e}")

    # Gemini scraper for AI-assisted extraction (optional fallback)
    if gemini_scraper and not all_events:  # Only use Gemini if no events from other sources
        try:
            gemini_events = await gemini_scraper(location, days)
            all_events.extend(gemini_events)
            logger.info(f"Gemini: added {len(gemini_events)} events")
        except Exception as e:
            logger.error(f"Gemini scraper error: {type(e).__name__}")

    # Deduplicate
    deduplicated = deduplicate_events(all_events)

    # Filter to requested date range
    now = datetime.now()
    end_date = now + timedelta(days=days)
    filtered = [
        e for e in deduplicated
        if e.dateStart and e.dateStart >= now.strftime("%Y-%m-%d") and e.dateStart <= end_date.strftime("%Y-%m-%d")
    ]

    # Sort by date
    filtered.sort(key=lambda e: e.dateStart)

    # Cache results
    event_cache[cache_key] = [e.model_dump() for e in filtered]

    return {"events": event_cache[cache_key], "cached": False, "total": len(filtered)}


async def fetch_eventbrite_jsonld(client: httpx.AsyncClient, location: str, state: str, days: int) -> list[Event]:
    """
    Fetch events from Eventbrite using JSON-LD extraction.
    No API key needed - extracts structured data from public pages.
    """
    events = []
    try:
        # Eventbrite URL format: /d/state--city/events/
        # Sanitize inputs for URL construction
        safe_state = re.sub(r'[^a-zA-Z]', '', state).lower()
        safe_location = re.sub(r'[^a-zA-Z]', '', location).lower()
        url = f"https://www.eventbrite.com/d/{safe_state}--{safe_location}/events/"
        logger.info(f"Fetching Eventbrite: {url}")

        response = await client.get(url, headers=HTTP_HEADERS, follow_redirects=True)

        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')

            # Extract JSON-LD structured data
            for script in soup.find_all('script', type='application/ld+json'):
                try:
                    data = json.loads(script.string)
                    if isinstance(data, dict) and data.get('@type') == 'ItemList':
                        for item in data.get('itemListElement', []):
                            event_data = item.get('item', {})
                            if event_data.get('@type') == 'Event':
                                # Extract date (format: 2025-12-27)
                                date_start = event_data.get('startDate', '')[:10] if event_data.get('startDate') else ''

                                # Get location
                                location_data = event_data.get('location', {})
                                location_name = location_data.get('name', '') if isinstance(location_data, dict) else ''

                                event = Event(
                                    id=f"eb_{hashlib.md5(event_data.get('url', '').encode()).hexdigest()[:8]}",
                                    title=event_data.get('name', '')[:150],
                                    description=None,  # JSON-LD doesn't include description
                                    url=event_data.get('url', ''),
                                    dateStart=date_start,
                                    location=location_name[:100] if location_name else None,
                                    submittedBy="Eventbrite",
                                    submittedAt=datetime.now().isoformat(),
                                )
                                if event.title and event.dateStart:
                                    events.append(event)
                except json.JSONDecodeError:
                    continue

        logger.info(f"Eventbrite: extracted {len(events)} events")
    except Exception as e:
        logger.error(f"Eventbrite extraction error: {type(e).__name__}")

    return events


async def fetch_ticketmaster_events(client: httpx.AsyncClient, location: str, state: str, days: int) -> list[Event]:
    """
    Fetch events from Ticketmaster Discovery API.
    Requires TICKETMASTER_API_KEY environment variable.
    Free tier: 5000 requests/day. Get key at: https://developer.ticketmaster.com/
    """
    events = []
    try:
        now = datetime.now()
        end_date = now + timedelta(days=days)

        logger.info(f"Fetching Ticketmaster for {location}, {state}")

        response = await client.get(
            "https://app.ticketmaster.com/discovery/v2/events.json",
            params={
                "apikey": TICKETMASTER_API_KEY,
                "city": location,
                "stateCode": state,
                "startDateTime": now.strftime("%Y-%m-%dT00:00:00Z"),
                "endDateTime": end_date.strftime("%Y-%m-%dT23:59:59Z"),
                "size": 30,
                "sort": "date,asc",
            }
        )

        if response.status_code == 200:
            data = response.json()
            for event_data in data.get("_embedded", {}).get("events", []):
                dates = event_data.get("dates", {}).get("start", {})

                # Get venue info
                venues = event_data.get("_embedded", {}).get("venues", [])
                venue_name = venues[0].get("name", "") if venues else ""

                event = Event(
                    id=f"tm_{event_data['id']}",
                    title=event_data.get("name", "")[:150],
                    description=event_data.get("info", "")[:200] if event_data.get("info") else None,
                    url=event_data.get("url", ""),
                    dateStart=dates.get("localDate", ""),
                    location=venue_name[:100] if venue_name else None,
                    submittedBy="Ticketmaster",
                    submittedAt=datetime.now().isoformat(),
                )
                if event.title and event.dateStart:
                    events.append(event)

            logger.info(f"Ticketmaster: extracted {len(events)} events")
        else:
            logger.warning(f"Ticketmaster API returned {response.status_code}")
    except Exception as e:
        logger.error(f"Ticketmaster API error: {type(e).__name__}")

    return events


@app.get("/health")
async def health():
    """Health check endpoint for Cloud Run."""
    sources = ["Eventbrite (JSON-LD)"]
    
    # Gemini event scraper (primary)
    if gemini_event_scraper:
        sources.append("Gemini Events (search grounding, 10 sources)")
    
    # Ollama fallback
    if multi_source_scraper:
        sources.append("Ollama Multi-Source (fallback)")
    
    if web_scrapers_enabled:
        sources.append("Web Scrapers (fallback)")
    if TICKETMASTER_API_KEY:
        sources.append("Ticketmaster (API)")
    if gemini_scraper:
        sources.append("Gemini (AI fallback)")

    return {
        "status": "healthy",
        "sources": sources,
        "ollama_enabled": ollama_available,
        "ollama_model": OLLAMA_MODEL if ollama_available else None,
        "web_scrapers_enabled": web_scrapers_enabled,
        "ticketmaster_enabled": bool(TICKETMASTER_API_KEY),
        "gemini_enabled": bool(gemini_scraper),
    }


@app.get("/wiki-format")
async def get_wiki_format(
    request: Request,
    days: int = Query(default=7, ge=1, le=14, description="Number of days ahead to fetch"),
    location: str = Query(default="Seattle", description="City name"),
    state: str = Query(default="WA", description="State code"),
):
    """
    Get events formatted for Reddit Wiki storage.
    Returns JSON that can be directly written to a wiki page.
    The wiki page can then be read by the Devvit app.
    """
    # Security checks
    check_rate_limit(request)
    verify_api_key(request)

    # Validate inputs
    location = validate_location(location)
    state = validate_state(state)

    # Get events using the standard endpoint logic
    all_events = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        tasks = [fetch_eventbrite_jsonld(client, location, state, days)]
        if TICKETMASTER_API_KEY:
            tasks.append(fetch_ticketmaster_events(client, location, state, days))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for result in results:
            if isinstance(result, list):
                all_events.extend(result)

    # Deduplicate
    deduplicated = deduplicate_events(all_events)

    # Filter to date range
    now = datetime.now()
    end_date = now + timedelta(days=days)
    filtered = [
        e for e in deduplicated
        if e.dateStart and e.dateStart >= now.strftime("%Y-%m-%d") and e.dateStart <= end_date.strftime("%Y-%m-%d")
    ]
    filtered.sort(key=lambda e: e.dateStart)

    # Format for wiki storage
    wiki_data = {
        "updated_at": datetime.now().isoformat(),
        "location": f"{location}, {state}",
        "days_ahead": days,
        "event_count": len(filtered),
        "events": [e.model_dump() for e in filtered],
    }

    return wiki_data



# Reddit scraper using Gemini for when PullPush is unavailable
async def scrape_reddit_crosslinks_with_gemini(
    target_subreddit: str,
    days: int = 7
) -> list[dict]:
    """
    Use Gemini to find Reddit posts linking to a target subreddit.
    This is a fallback when PullPush.io is unavailable.
    """
    if not GOOGLE_API_KEY:
        return []
    
    try:
        import google.generativeai as genai
        genai.configure(api_key=GOOGLE_API_KEY)
        model = genai.GenerativeModel("gemini-2.0-flash")
        
        prompt = f"""Search for recent Reddit posts from the last {days} days that link to or mention r/{target_subreddit}.

Return ONLY a valid JSON array (no markdown) with this format:
[
  {{
    "id": "unique_post_id",
    "subreddit": "SourceSubreddit",
    "title": "Post title",
    "url": "https://reddit.com/r/...",
    "author": "username",
    "created_utc": 1234567890
  }}
]

Only include posts that directly link to or discuss r/{target_subreddit}. 
If no posts found, return: []"""

        response = model.generate_content(
            prompt,
            generation_config={"temperature": 0.1, "max_output_tokens": 4096},
        )
        
        text = response.text.strip()
        # Clean markdown code blocks
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()
        
        import json
        return json.loads(text) if text else []
    except Exception as e:
        logger.error(f"Gemini Reddit scrape failed: {type(e).__name__}: {e}")
        return []


@app.get("/reddit/crosslinks")
async def get_reddit_crosslinks(
    request: Request,
    target: str = Query(..., description="Target subreddit name (without r/)"),
    days: int = Query(default=7, ge=1, le=30, description="Days to look back"),
):
    """
    Find Reddit posts that link to a target subreddit.
    Uses Gemini AI to search when PullPush is unavailable.
    """
    check_rate_limit(request)
    verify_api_key(request)
    
    # Validate target subreddit name
    target = target.strip().replace("r/", "")
    if not re.match(r'^[a-zA-Z0-9_]{3,21}$', target):
        raise HTTPException(status_code=400, detail="Invalid subreddit name")
    
    cache_key = f"crosslinks:{target}:{days}"
    if cache_key in event_cache:
        return {"crosslinks": event_cache[cache_key], "cached": True}
    
    crosslinks = await scrape_reddit_crosslinks_with_gemini(target, days)
    
    # Cache for 15 minutes for crosslinks
    event_cache[cache_key] = crosslinks
    
    return {"crosslinks": crosslinks, "cached": False, "total": len(crosslinks)}


@app.get("/reddit/submissions")
async def get_reddit_submissions(
    request: Request,
    subreddit: str = Query(None, description="Subreddit to search"),
    author: str = Query(None, description="Author username"),
    q: str = Query(None, description="Search query"),
    after: int = Query(None, description="Unix timestamp - posts after this time"),
    before: int = Query(None, description="Unix timestamp - posts before this time"),
    limit: int = Query(default=50, ge=1, le=100, description="Max results"),
):
    """
    Search for Reddit submissions. Fallback endpoint for PullPush.
    Uses Gemini AI to search Reddit content.
    """
    check_rate_limit(request)
    verify_api_key(request)
    
    if not any([subreddit, author, q]):
        raise HTTPException(status_code=400, detail="At least one search parameter required")
    
    # Build search context
    search_parts = []
    if subreddit:
        search_parts.append(f"in r/{subreddit}")
    if author:
        search_parts.append(f"by u/{author}")
    if q:
        search_parts.append(f"containing '{q}'")
    
    search_context = " ".join(search_parts)
    
    if not GOOGLE_API_KEY:
        return {"data": [], "error": "Gemini API not configured"}
    
    try:
        import google.generativeai as genai
        genai.configure(api_key=GOOGLE_API_KEY)
        model = genai.GenerativeModel("gemini-2.0-flash")
        
        prompt = f"""Search for Reddit posts {search_context}.

Return ONLY a valid JSON object (no markdown) with this format:
{{
  "data": [
    {{
      "id": "post_id",
      "author": "username",
      "title": "Post title",
      "selftext": "Post body if any",
      "url": "https://reddit.com/...",
      "permalink": "/r/subreddit/comments/id/...",
      "created_utc": 1234567890,
      "subreddit": "SubredditName",
      "score": 0,
      "num_comments": 0
    }}
  ]
}}

Return up to {limit} results. If no posts found, return: {{"data": []}}"""

        response = model.generate_content(
            prompt,
            generation_config={"temperature": 0.1, "max_output_tokens": 8192},
        )
        
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()
        
        import json
        result = json.loads(text) if text else {"data": []}
        return result
    except Exception as e:
        logger.error(f"Gemini submission search failed: {type(e).__name__}: {e}")
        return {"data": [], "error": str(e)}




# =============================================================================
# UNIFIED CONTENT ANALYSIS ENDPOINT
# =============================================================================

from models import ContentAnalysisRequest, ContentAnalysisResponse
from detectors import detect_haiku, detect_farewell, detect_political_complaint, detect_crosslinks, classify_tone
import time


def emit_detection_log(event_type: str, **kwargs):
    """Emit structured log for Cloud Logging metrics."""
    log_entry = {
        "event": event_type,
        "timestamp": int(time.time() * 1000),
        **kwargs
    }
    # Structured JSON logging for GCP
    print(json.dumps(log_entry))


@app.post("/analyze/content")
async def analyze_content(
    request: Request,
    content: ContentAnalysisRequest,
):
    """
    Unified content analysis endpoint.
    Runs all detections in parallel and returns results.
    
    This is the main integration point - Devvit apps call this endpoint
    to get detection results for comments/posts.
    """
    check_rate_limit(request)
    verify_api_key(request)
    
    start_time = time.time()
    events_emitted = []
    
    # Run all detections
    text = content.body
    if content.title:
        text = content.title + "\n\n" + content.body
    # Haiku detection
    haiku_result = detect_haiku(text)
    
    # Farewell detection
    farewell_result = detect_farewell(text)
    
    # Political complaint detection
    political_result = detect_political_complaint(text)
    
    # Crosslink detection
    crosslink_result = detect_crosslinks(text, exclude_subreddit=content.subreddit)
    
    # Tone classification (async)
    tone_result = await classify_tone(text)
    
    # Emit structured logs for detections
    if haiku_result.detected:
        emit_detection_log(
            "haiku_detection",
            subreddit=content.subreddit,
            author=content.author,
            content_id=content.id,
        )
        events_emitted.append("haiku_detection")
    
    if farewell_result.detected:
        emit_detection_log(
            "farewell_announcement",
            subreddit=content.subreddit,
            author=content.author,
            content_id=content.id,
            confidence=farewell_result.confidence,
        )
        events_emitted.append("farewell_announcement")
    
    if political_result.detected:
        emit_detection_log(
            "political_complaint",
            subreddit=content.subreddit,
            author=content.author,
            content_id=content.id,
            complaint_type=political_result.complaint_type,
        )
        events_emitted.append("political_complaint")
    
    if crosslink_result.detected:
        # Check if any crosslinks are hostile
        if tone_result.classification in ("adversarial", "hateful"):
            for link in crosslink_result.links:
                emit_detection_log(
                    "hostile_crosslink",
                    source_subreddit=link.subreddit,
                    target_subreddit=content.subreddit,
                    classification=tone_result.classification,
                    content_id=content.id,
                )
            events_emitted.append("hostile_crosslink")
    
    processing_time = int((time.time() - start_time) * 1000)
    
    return ContentAnalysisResponse(
        id=content.id,
        type=content.type,
        subreddit=content.subreddit,
        author=content.author,
        detections={
            "haiku": {
                "detected": haiku_result.detected,
                "lines": haiku_result.lines,
                "syllables": haiku_result.syllables,
            },
            "farewell": {
                "detected": farewell_result.detected,
                "confidence": farewell_result.confidence,
                "matched_patterns": farewell_result.matched_patterns,
            },
            "political_complaint": {
                "detected": political_result.detected,
                "complaint_type": political_result.complaint_type,
            },
            "crosslink": {
                "detected": crosslink_result.detected,
                "links": [
                    {
                        "subreddit": link.subreddit,
                        "full_url": link.full_url,
                        "post_id": link.post_id,
                        "comment_id": link.comment_id,
                    }
                    for link in crosslink_result.links
                ],
            },
            "tone": {
                "tone": tone_result.tone,
                "confidence": tone_result.confidence,
                "classification": tone_result.classification,
                "trigger_phrase": tone_result.trigger_phrase,
            },
        },
        events_emitted=events_emitted,
        processing_time_ms=processing_time,
    )


@app.post("/analyze/batch")
async def analyze_batch(
    request: Request,
    contents: list[ContentAnalysisRequest],
):
    """
    Batch content analysis - analyze multiple items at once.
    More efficient than calling /analyze/content multiple times.
    """
    check_rate_limit(request)
    verify_api_key(request)
    
    # Limit batch size
    if len(contents) > 50:
        raise HTTPException(status_code=400, detail="Batch size exceeds limit of 50")
    
    results = []
    for content in contents:
        # Create a mock request for rate limiting bypass within batch
        result = await analyze_content(request, content)
        results.append(result)
    
    return {"results": results, "count": len(results)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8080)))
