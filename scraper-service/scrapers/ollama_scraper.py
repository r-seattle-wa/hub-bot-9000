"""
Ollama-based event scraper using local LLM.
Supports any Ollama-compatible model running in Docker or locally.

To use:
1. Run Ollama: docker run -d -p 11434:11434 ollama/ollama
2. Pull a model: docker exec -it <container> ollama pull llama3.2
3. Set OLLAMA_URL=http://localhost:11434 and OLLAMA_MODEL=llama3.2
"""
import os
import json
import hashlib
from datetime import datetime, timedelta
from typing import Optional
import httpx

from models import Event

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")


async def check_ollama_available() -> bool:
    """Check if Ollama is running and available."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{OLLAMA_URL}/api/tags")
            return response.status_code == 200
    except Exception:
        return False


async def query_ollama(prompt: str, model: str = None) -> Optional[str]:
    """Query Ollama with a prompt and return the response."""
    model = model or OLLAMA_MODEL

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.1,
                        "num_predict": 4096,
                    }
                }
            )

            if response.status_code == 200:
                data = response.json()
                return data.get("response", "")
    except Exception as e:
        print(f"Ollama query error: {type(e).__name__}: {e}")

    return None


async def extract_events_with_ollama(
    html_content: str,
    source_name: str,
    source_url: str,
    model: str = None
) -> list[Event]:
    """
    Use Ollama to extract events from HTML content.
    """
    events = []

    # Truncate HTML to avoid overwhelming the model
    html_snippet = html_content[:15000]

    prompt = f"""Extract event information from this HTML content from {source_name}.

HTML:
{html_snippet}

Return ONLY a JSON array with this exact format (no markdown, no explanation):
[
  {{
    "title": "Event Name",
    "date": "YYYY-MM-DD",
    "location": "Venue Name",
    "url": "https://...",
    "description": "Brief description"
  }}
]

Only include actual events, not navigation or other content.
If no events found, return: []"""

    response = await query_ollama(prompt, model)

    if response:
        # Clean up response
        text = response.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()

        try:
            if text.startswith("["):
                events_data = json.loads(text)

                for evt in events_data:
                    if evt.get("title") and evt.get("date"):
                        event = Event(
                            id=f"ollama_{hashlib.md5((evt['title'] + evt['date']).encode()).hexdigest()[:8]}",
                            title=evt["title"][:150],
                            description=evt.get("description", "")[:200] if evt.get("description") else None,
                            url=evt.get("url", source_url),
                            dateStart=evt["date"],
                            location=evt.get("location", "")[:100] if evt.get("location") else None,
                            submittedBy=source_name,
                            submittedAt=datetime.now().isoformat(),
                        )
                        events.append(event)

                print(f"Ollama: {source_name} returned {len(events)} events")
        except json.JSONDecodeError as e:
            print(f"Ollama JSON parse error for {source_name}: {e}")

    return events


async def fetch_events_with_ollama(location: str = "Seattle", days: int = 7) -> list[Event]:
    """
    Fetch events using Ollama local LLM to parse HTML from event sources.
    """
    if not await check_ollama_available():
        print("Ollama not available")
        return []

    all_events = []

    sources = [
        {
            "name": "EverOut Seattle",
            "url": "https://everout.com/seattle/events/",
        },
        {
            "name": "MoPOP",
            "url": "https://www.mopop.org/events",
        },
        {
            "name": "Seattle Met",
            "url": "https://www.seattlemet.com/arts-and-culture/things-to-do-in-seattle-events",
        },
        {
            "name": "Seattle.gov",
            "url": "https://www.seattle.gov/event-calendar",
        },
    ]

    async with httpx.AsyncClient(timeout=30.0) as client:
        for source in sources:
            try:
                response = await client.get(
                    source["url"],
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        "Accept": "text/html,application/xhtml+xml",
                    },
                    follow_redirects=True
                )

                if response.status_code == 200:
                    events = await extract_events_with_ollama(
                        response.text,
                        source["name"],
                        source["url"]
                    )
                    all_events.extend(events)
                else:
                    print(f"Ollama: {source['name']} returned {response.status_code}")

            except Exception as e:
                print(f"Ollama: Error fetching {source['name']}: {type(e).__name__}")

    return all_events


async def classify_tone_with_ollama(text: str, model: str = None) -> dict:
    """
    Classify tone using Ollama as fallback to Gemini.
    """
    if not await check_ollama_available():
        return None

    prompt = f"""Analyze the tone of this text and classify it.

Text: "{text[:500]}"

Return ONLY valid JSON (no markdown):
{{
  "tone": "polite" | "neutral" | "frustrated" | "hostile" | "dramatic",
  "confidence": 0.0-1.0,
  "classification": "friendly" | "neutral" | "adversarial" | "hateful",
  "trigger_phrase": "optional phrase that indicates the tone"
}}

Definitions:
- polite: Kind, appreciative, welcoming
- neutral: Matter-of-fact, no strong emotion
- frustrated: Annoyed but not aggressive
- hostile: Aggressive, attacking, insulting
- dramatic: Over-the-top emotional, exaggerated

- friendly: Positive engagement
- neutral: Neither positive nor negative
- adversarial: Critical, negative, attacking the community
- hateful: Contains slurs, threats, or extreme hostility"""

    response = await query_ollama(prompt, model)

    if response:
        text = response.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()

        try:
            if text.startswith("{"):
                return json.loads(text)
        except json.JSONDecodeError:
            pass

    return None
