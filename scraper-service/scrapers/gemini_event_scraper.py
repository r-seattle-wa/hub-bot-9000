"""
Gemini-based Seattle event scraper using Google Search grounding.
Fast, reliable, uses free tier (15 req/min, 1500 req/day).
"""
import os
import re
import json
import hashlib
from datetime import datetime, timedelta
from typing import Optional
import google.generativeai as genai

from models import Event

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# Seattle event sources - Gemini will search these via grounding
EVENT_SOURCES = [
    {"name": "MoPOP", "query": "site:mopop.org upcoming events Seattle", "icon": "museum"},
    {"name": "Seattle Art Museum", "query": "site:seattleartmuseum.org events exhibitions", "icon": "art"},
    {"name": "Burke Museum", "query": "site:burkemuseum.org calendar events Seattle", "icon": "museum"},
    {"name": "Frye Art Museum", "query": "site:fryemuseum.org calendar events", "icon": "art"},
    {"name": "Visit Seattle", "query": "site:visitseattle.org events things to do", "icon": "tourism"},
    {"name": "Seattle Public Library", "query": "site:spl.org events programs Seattle", "icon": "library"},
    {"name": "West Seattle Blog", "query": "site:westseattleblog.com events calendar", "icon": "community"},
    {"name": "Events12", "query": "site:events12.com Seattle events", "icon": "calendar"},
    {"name": "EverOut Seattle", "query": "site:everout.com Seattle events concerts shows", "icon": "entertainment"},
    {"name": "The Stranger", "query": "site:thestranger.com Seattle events calendar", "icon": "entertainment"},
]


def get_gemini_model():
    """Initialize Gemini model with search grounding."""
    if not GOOGLE_API_KEY:
        return None

    genai.configure(api_key=GOOGLE_API_KEY)
    return genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        generation_config={
            "temperature": 0.1,
            "top_p": 0.95,
            "max_output_tokens": 4096,
        }
    )


def generate_event_id(title: str, date: str, source: str) -> str:
    """Generate consistent event ID."""
    key = f"{title}:{date}:{source}"
    return f"evt_{hashlib.md5(key.encode()).hexdigest()[:12]}"


async def fetch_events_from_source(model, source: dict, location: str, days: int) -> list[Event]:
    """Fetch events from a single source using Gemini with search grounding."""
    events = []
    today = datetime.now().strftime("%Y-%m-%d")
    end_date = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d")

    prompt = f"""Search for upcoming events in {location} from {source['name']}.

Find events happening between {today} and {end_date}.

Return ONLY a JSON array (no markdown, no explanation):
[
  {{
    "title": "Event Name",
    "date": "YYYY-MM-DD",
    "location": "Venue Name",
    "url": "https://...",
    "description": "Brief description"
  }}
]

If no events found, return: []

Search: {source['query']} {location} {today}"""

    try:
        response = model.generate_content(
            prompt,
            tools=[{"google_search_retrieval": {"dynamic_retrieval_config": {"mode": "MODE_DYNAMIC"}}}]
        )

        text = response.text.strip()

        # Clean markdown
        if text.startswith("```"):
            text = re.sub(r'^```json?\n?', '', text)
            text = re.sub(r'\n?```$', '', text)
        text = text.strip()

        if text and text.startswith("["):
            events_data = json.loads(text)

            for evt in events_data:
                if evt.get("title") and evt.get("date"):
                    event = Event(
                        id=generate_event_id(evt["title"], evt["date"], source["name"]),
                        title=evt["title"][:150],
                        description=evt.get("description", "")[:200] if evt.get("description") else None,
                        url=evt.get("url", ""),
                        dateStart=evt["date"],
                        location=evt.get("location", "Seattle, WA")[:100] if evt.get("location") else "Seattle, WA",
                        submittedBy=source["name"],
                        submittedAt=datetime.now().isoformat(),
                    )
                    events.append(event)

            print(f"Gemini [{source['name']}]: {len(events)} events")
        else:
            print(f"Gemini [{source['name']}]: no events found")

    except json.JSONDecodeError as e:
        print(f"Gemini [{source['name']}]: JSON error - {e}")
    except Exception as e:
        error_msg = str(e)
        if "429" in error_msg or "quota" in error_msg.lower():
            print(f"Gemini [{source['name']}]: rate limited")
        else:
            print(f"Gemini [{source['name']}]: {type(e).__name__}")

    return events


async def fetch_all_seattle_events(
    location: str = "Seattle",
    days: int = 14,
    sources: list[str] = None,
    max_sources: int = 5,  # Limit to stay within rate limits
) -> list[Event]:
    """
    Fetch events from multiple sources using Gemini.

    Args:
        location: City name
        days: Days ahead to search
        sources: Optional list of source names to use
        max_sources: Maximum sources to query (for rate limiting)
    """
    model = get_gemini_model()
    if not model:
        print("Gemini API key not configured")
        return []

    all_events = []

    # Filter/limit sources
    if sources:
        active_sources = [s for s in EVENT_SOURCES if s["name"] in sources]
    else:
        active_sources = EVENT_SOURCES[:max_sources]

    print(f"Fetching events from {len(active_sources)} sources via Gemini...")

    for source in active_sources:
        events = await fetch_events_from_source(model, source, location, days)
        all_events.extend(events)

    # Deduplicate
    seen_titles = set()
    unique_events = []
    for event in all_events:
        title_key = event.title.lower()[:30]
        if title_key not in seen_titles:
            seen_titles.add(title_key)
            unique_events.append(event)

    print(f"Total: {len(unique_events)} unique events")
    return unique_events


async def fetch_events_single_query(location: str = "Seattle", days: int = 14) -> list[Event]:
    """
    Fetch events with a single Gemini query (most efficient for rate limits).
    Uses Google Search grounding to find events across all sources at once.
    """
    model = get_gemini_model()
    if not model:
        return []

    today = datetime.now().strftime("%Y-%m-%d")
    end_date = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d")

    prompt = f"""Find upcoming events in {location}, Washington happening between {today} and {end_date}.

Search these sources: MoPOP, Seattle Art Museum, Burke Museum, Frye Art Museum,
Visit Seattle, Seattle Public Library, EverOut Seattle, The Stranger events.

Return ONLY a JSON array with up to 30 events (no markdown):
[
  {{
    "title": "Event Name",
    "date": "YYYY-MM-DD",
    "location": "Venue",
    "source": "Source Name",
    "url": "https://...",
    "description": "Brief description"
  }}
]

Include concerts, exhibitions, festivals, community events, museum programs.
Return [] if no events found."""

    try:
        response = model.generate_content(
            prompt,
            tools=[{"google_search_retrieval": {"dynamic_retrieval_config": {"mode": "MODE_DYNAMIC"}}}]
        )

        text = response.text.strip()
        if text.startswith("```"):
            text = re.sub(r'^```json?\n?', '', text)
            text = re.sub(r'\n?```$', '', text)

        events = []
        if text and text.startswith("["):
            events_data = json.loads(text)

            for evt in events_data:
                if evt.get("title"):
                    event = Event(
                        id=generate_event_id(evt["title"], evt.get("date", ""), evt.get("source", "Gemini")),
                        title=evt["title"][:150],
                        description=evt.get("description", "")[:200] if evt.get("description") else None,
                        url=evt.get("url", ""),
                        dateStart=evt.get("date"),
                        location=evt.get("location", "Seattle, WA")[:100],
                        submittedBy=evt.get("source", "Gemini Search"),
                        submittedAt=datetime.now().isoformat(),
                    )
                    events.append(event)

        print(f"Gemini single query: {len(events)} events")
        return events

    except Exception as e:
        print(f"Gemini single query error: {e}")
        return []


def check_gemini_available() -> bool:
    """Check if Gemini API is configured."""
    return bool(GOOGLE_API_KEY)
