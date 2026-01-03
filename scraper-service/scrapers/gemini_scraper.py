"""
Gemini-based event scraper using Google Search grounding.
Handles sites that block traditional scrapers.
"""
import os
import json
from datetime import datetime, timedelta
from typing import Optional
import google.generativeai as genai

from models import Event

# Configure Gemini
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# Event sources to scrape via Gemini
# Tested December 2025 - ranked by reliability
GEMINI_SOURCES = [
    # Best sources (AI parsing works well)
    {
        "name": "Seattle Met",
        "url": "https://www.seattlemet.com/arts-and-culture/things-to-do-in-seattle-events",
        "query": "site:seattlemet.com things to do events Seattle",
        "icon": "📰",
    },
    {
        "name": "Visit Seattle",
        "url": "https://visitseattle.org/things-to-do/events/",
        "query": "site:visitseattle.org events Seattle",
        "icon": "🏙️",
    },
    {
        "name": "West Seattle Blog",
        "url": "https://westseattleblog.com/events/",
        "query": "site:westseattleblog.com events",
        "icon": "🌊",
    },
    {
        "name": "MoPOP",
        "url": "https://www.mopop.org/events",
        "query": "site:mopop.org/events upcoming events",
        "icon": "🎸",
    },
    # May be blocked or require JS
    {
        "name": "EverOut Seattle",
        "url": "https://everout.com/seattle/events/",
        "query": "site:everout.com/seattle/events upcoming events",
        "icon": "🎭",
    },
    {
        "name": "Seattle.gov",
        "url": "https://www.seattle.gov/event-calendar",
        "query": "site:seattle.gov/event-calendar upcoming events",
        "icon": "🏛️",
    },
]


def get_gemini_model():
    """Initialize Gemini model with grounding."""
    if not GOOGLE_API_KEY:
        return None

    genai.configure(api_key=GOOGLE_API_KEY)

    # Use Gemini 2.0 Flash (1.5 was deprecated April 2025)
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        generation_config={
            "temperature": 0.1,  # Low temperature for factual extraction
            "top_p": 0.95,
            "max_output_tokens": 4096,
        }
    )
    return model


async def fetch_events_with_gemini(location: str = "Seattle", days: int = 7) -> list[Event]:
    """
    Use Gemini with Google Search grounding to find events.
    """
    model = get_gemini_model()
    if not model:
        print("Gemini API key not configured")
        return []

    all_events = []
    today = datetime.now().strftime("%Y-%m-%d")
    end_date = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d")

    for source in GEMINI_SOURCES:
        try:
            prompt = f"""Search for upcoming events in {location} from {source['name']}.

Find events happening between {today} and {end_date}.

Return ONLY a JSON array of events with this exact format (no markdown, no explanation):
[
  {{
    "title": "Event Name",
    "date": "YYYY-MM-DD",
    "location": "Venue Name",
    "url": "https://...",
    "description": "Brief description"
  }}
]

If no events found, return an empty array: []

Search query: {source['query']} {location} {today}"""

            # Use Google Search grounding
            response = model.generate_content(
                prompt,
                tools=[{"google_search_retrieval": {"dynamic_retrieval_config": {"mode": "MODE_DYNAMIC"}}}]
            )

            # Parse the response
            text = response.text.strip()

            # Clean up response - remove markdown code blocks if present
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            text = text.strip()

            if text and text.startswith("["):
                events_data = json.loads(text)

                for evt in events_data:
                    if evt.get("title") and evt.get("date"):
                        event = Event(
                            id=f"gem_{hash(evt['title'] + evt['date']) & 0xFFFFFFFF:08x}",
                            title=evt["title"][:150],
                            description=evt.get("description", "")[:200] if evt.get("description") else None,
                            url=evt.get("url", ""),
                            dateStart=evt["date"],
                            location=evt.get("location", "")[:100] if evt.get("location") else None,
                            submittedBy=source["name"],
                            submittedAt=datetime.now().isoformat(),
                        )
                        all_events.append(event)

                print(f"Gemini: {source['name']} returned {len(events_data)} events")
            else:
                print(f"Gemini: {source['name']} returned no parseable events")

        except json.JSONDecodeError as e:
            print(f"Gemini: JSON parse error for {source['name']}: {e}")
        except Exception as e:
            print(f"Gemini: Error fetching {source['name']}: {e}")

    return all_events


async def fetch_specific_source_with_gemini(
    source_name: str,
    source_url: str,
    location: str = "Seattle",
    days: int = 7
) -> list[Event]:
    """
    Use Gemini to extract events from a specific source URL.
    """
    model = get_gemini_model()
    if not model:
        return []

    today = datetime.now().strftime("%Y-%m-%d")
    end_date = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d")

    try:
        prompt = f"""Look up events from this source: {source_url}

Find events in {location} happening between {today} and {end_date}.

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

If no events found, return: []"""

        response = model.generate_content(
            prompt,
            tools=[{"google_search_retrieval": {"dynamic_retrieval_config": {"mode": "MODE_DYNAMIC"}}}]
        )

        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()

        events = []
        if text and text.startswith("["):
            events_data = json.loads(text)
            for evt in events_data:
                if evt.get("title") and evt.get("date"):
                    event = Event(
                        id=f"gem_{hash(evt['title'] + evt['date']) & 0xFFFFFFFF:08x}",
                        title=evt["title"][:150],
                        description=evt.get("description", "")[:200] if evt.get("description") else None,
                        url=evt.get("url", source_url),
                        dateStart=evt["date"],
                        location=evt.get("location", "")[:100] if evt.get("location") else None,
                        submittedBy=source_name,
                        submittedAt=datetime.now().isoformat(),
                    )
                    events.append(event)

        return events

    except Exception as e:
        print(f"Gemini: Error fetching {source_name}: {e}")
        return []
