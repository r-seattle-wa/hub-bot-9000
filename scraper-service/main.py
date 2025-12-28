"""
Seattle Event Scraper Service
Aggregates events from multiple sources and returns deduplicated JSON.

Data sources:
1. Eventbrite - Public JSON-LD extraction (no API key needed!)
2. Ticketmaster - API with free tier (optional, needs TICKETMASTER_API_KEY)
3. Gemini - AI-powered scraping for blocked sites (optional, needs GOOGLE_API_KEY)
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
    title="Seattle Event Scraper",
    version="1.0.0",
    docs_url="/docs" if os.getenv("ENABLE_DOCS", "false").lower() == "true" else None,
)

# CORS - restrict to known origins in production
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "").split(",") if os.getenv("ALLOWED_ORIGINS") else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET"],
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

    # Gemini scraper for blocked sites (optional - runs outside httpx context)
    if gemini_scraper:
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
    if TICKETMASTER_API_KEY:
        sources.append("Ticketmaster (API)")
    if gemini_scraper:
        sources.append("Gemini (AI)")

    return {
        "status": "healthy",
        "sources": sources,
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8080)))
