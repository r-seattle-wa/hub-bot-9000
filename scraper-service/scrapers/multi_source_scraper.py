"""
Multi-source Seattle event scraper using Ollama LLM extraction.
Tested December 2025 - all sources verified working.
"""
import os
import re
import json
import hashlib
from datetime import datetime
from typing import Optional
import requests
from bs4 import BeautifulSoup

from models import Event

# Ollama configuration
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3")

# Verified working Seattle event sources - December 2025
EVENT_SOURCES = [
    # Museums - excellent event data
    {
        "name": "MoPOP",
        "url": "https://www.mopop.org/events",
        "selector": ".events-wrapper",
        "icon": "museum",
        "expected_events": 8,
    },
    {
        "name": "Seattle Art Museum",
        "url": "https://www.seattleartmuseum.org/events",
        "selector": "article",
        "icon": "art",
        "expected_events": 7,
    },
    {
        "name": "Burke Museum",
        "url": "https://www.burkemuseum.org/calendar",
        "selector": None,  # Use full body
        "icon": "museum",
        "expected_events": 14,
    },
    {
        "name": "Frye Art Museum",
        "url": "https://fryemuseum.org/calendar/",
        "selector": "[class*='event']",
        "icon": "art",
        "expected_events": 10,
    },
    # Tourism & city
    {
        "name": "Visit Seattle",
        "url": "https://visitseattle.org/things-to-do/events/",
        "selector": "[class*='event']",
        "icon": "tourism",
        "expected_events": 9,
    },
    # Public institutions
    {
        "name": "Seattle Public Library",
        "url": "https://www.spl.org/event-calendar",
        "selector": None,
        "icon": "library",
        "expected_events": 2,
    },
    # Community/local
    {
        "name": "Fremont Sunday Market",
        "url": "https://www.fremontmarket.com/",
        "selector": None,
        "icon": "market",
        "expected_events": 5,
    },
    {
        "name": "West Seattle Blog",
        "url": "https://westseattleblog.com/events/",
        "selector": "[class*='event']",
        "icon": "community",
        "expected_events": 10,
    },
    # Aggregators - many events
    {
        "name": "Events12 Seattle",
        "url": "https://www.events12.com/seattle/",
        "selector": None,
        "icon": "calendar",
        "expected_events": 23,
    },
    # Entertainment venues
    {
        "name": "Jet City Improv",
        "url": "https://www.jetcityimprov.org/",
        "selector": None,
        "icon": "comedy",
        "expected_events": 10,
    },
]


def generate_event_id(title: str, date: str, source: str) -> str:
    """Generate a consistent event ID."""
    key = f"{title}:{date}:{source}"
    return f"evt_{hashlib.md5(key.encode()).hexdigest()[:12]}"


def extract_with_ollama(text: str, source_name: str, timeout: int = 120) -> list[dict]:
    """Extract events from text using Ollama LLM."""
    if not text or len(text) < 50:
        return []

    prompt = f"""Extract ALL events from this {source_name} website text.
Return ONLY a valid JSON array - no markdown, no explanation.

Text:
{text[:10000]}

Format: [{{"title":"Event Name","date":"YYYY-MM-DD","location":"Venue","description":"Brief"}}]
Use actual dates from the text. Return [] if no events found.

JSON:"""

    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.1, "num_predict": 3000}
            },
            timeout=timeout
        )
        result = resp.json()
        resp_text = result.get("response", "").strip()

        # Clean markdown code blocks
        if resp_text.startswith("```"):
            resp_text = re.sub(r'^```json?\n?', '', resp_text)
            resp_text = re.sub(r'\n?```$', '', resp_text)

        events = json.loads(resp_text)
        duration = result.get("total_duration", 0) / 1e9
        print(f"  Ollama: {len(events)} events in {duration:.1f}s")
        return events

    except json.JSONDecodeError as e:
        print(f"  Ollama JSON error: {e}")
        return []
    except requests.exceptions.Timeout:
        print(f"  Ollama timeout")
        return []
    except Exception as e:
        print(f"  Ollama error: {e}")
        return []


async def fetch_source_events(source: dict) -> list[Event]:
    """Fetch events from a single source using Ollama extraction."""
    events = []
    name = source["name"]
    url = source["url"]
    selector = source.get("selector")

    print(f"\n[{name}] Fetching {url}")

    try:
        resp = requests.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; hub-bot-9000/1.0)"},
            timeout=20
        )

        if resp.status_code != 200:
            print(f"  HTTP {resp.status_code}")
            return []

        soup = BeautifulSoup(resp.text, 'html.parser')

        # Extract text using selector or full body
        if selector:
            elements = soup.select(selector)
            text = ' '.join([e.get_text(separator=' ', strip=True) for e in elements[:15]])
        else:
            main = soup.select_one('main, article, .content, #content')
            if main:
                text = main.get_text(separator=' ', strip=True)
            else:
                text = soup.body.get_text(separator=' ', strip=True)[:15000] if soup.body else ""

        print(f"  Content: {len(text)} chars")

        if len(text) < 100:
            print(f"  Not enough content")
            return []

        # Extract with Ollama
        extracted = extract_with_ollama(text, name)

        for evt in extracted:
            if evt.get("title"):
                event = Event(
                    id=generate_event_id(evt["title"], evt.get("date", ""), name),
                    title=evt["title"][:150],
                    description=evt.get("description", "")[:200] if evt.get("description") else None,
                    url=url,
                    dateStart=evt.get("date"),
                    location=evt.get("location", "Seattle, WA")[:100] if evt.get("location") else "Seattle, WA",
                    submittedBy=name,
                    submittedAt=datetime.now().isoformat(),
                )
                events.append(event)

        print(f"  Returned {len(events)} events")

    except requests.exceptions.ConnectionError:
        print(f"  Connection refused")
    except Exception as e:
        print(f"  Error: {e}")

    return events


async def fetch_all_events(sources: list[str] = None) -> list[Event]:
    """
    Fetch events from all configured sources.

    Args:
        sources: Optional list of source names to fetch. If None, fetches all.

    Returns:
        List of Event objects from all sources.
    """
    all_events = []

    # Filter sources if specified
    if sources:
        active_sources = [s for s in EVENT_SOURCES if s["name"] in sources]
    else:
        active_sources = EVENT_SOURCES

    print(f"Fetching events from {len(active_sources)} sources...")

    for source in active_sources:
        events = await fetch_source_events(source)
        all_events.extend(events)

    # Deduplicate by title similarity
    seen_titles = set()
    unique_events = []
    for event in all_events:
        title_key = event.title.lower()[:30]
        if title_key not in seen_titles:
            seen_titles.add(title_key)
            unique_events.append(event)

    print(f"\n{'='*50}")
    print(f"Total: {len(unique_events)} unique events from {len(active_sources)} sources")
    print(f"{'='*50}")

    return unique_events


def check_ollama_available() -> bool:
    """Check if Ollama is available and has the required model."""
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            models = [m.get("name", "") for m in data.get("models", [])]
            if any(OLLAMA_MODEL in m for m in models):
                return True
            print(f"Ollama available but {OLLAMA_MODEL} not found. Models: {models}")
        return False
    except:
        return False


def get_source_list() -> list[dict]:
    """Return list of configured sources with metadata."""
    return [
        {
            "name": s["name"],
            "url": s["url"],
            "icon": s.get("icon", "event"),
            "expected_events": s.get("expected_events", 0),
        }
        for s in EVENT_SOURCES
    ]
