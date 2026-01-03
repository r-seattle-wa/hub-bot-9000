"""
Direct web scrapers for Seattle event sources.
No AI required - uses BeautifulSoup for HTML parsing.
"""
import hashlib
import json
import re
from datetime import datetime, timedelta
from typing import Optional
import asyncio
import httpx
from bs4 import BeautifulSoup

from models import Event

HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# Polite delay between requests to different sites (seconds)
POLITE_DELAY = 2.0


async def scrape_everout_seattle(client: httpx.AsyncClient, days: int = 7) -> list[Event]:
    """
    Scrape events from EverOut Seattle.
    EverOut uses JSON-LD structured data which makes parsing easier.
    """
    events = []
    try:
        url = "https://everout.com/seattle/events/"
        print(f"Fetching EverOut: {url}")

        response = await client.get(url, headers=HTTP_HEADERS, follow_redirects=True, timeout=30.0)

        if response.status_code != 200:
            print(f"EverOut returned {response.status_code}")
            return events

        soup = BeautifulSoup(response.text, 'html.parser')

        # Look for JSON-LD structured data
        for script in soup.find_all('script', type='application/ld+json'):
            try:
                data = json.loads(script.string)
                if isinstance(data, dict) and data.get('@type') == 'ItemList':
                    for item in data.get('itemListElement', []):
                        event_data = item.get('item', {})
                        if event_data.get('@type') == 'Event':
                            date_start = event_data.get('startDate', '')[:10] if event_data.get('startDate') else ''
                            location_data = event_data.get('location', {})
                            location_name = location_data.get('name', '') if isinstance(location_data, dict) else ''

                            event = Event(
                                id=f"everout_{hashlib.md5(event_data.get('url', '').encode()).hexdigest()[:8]}",
                                title=event_data.get('name', '')[:150],
                                description=event_data.get('description', '')[:200] if event_data.get('description') else None,
                                url=event_data.get('url', ''),
                                dateStart=date_start,
                                location=location_name[:100] if location_name else None,
                                submittedBy="EverOut Seattle",
                                submittedAt=datetime.now().isoformat(),
                            )
                            if event.title and event.dateStart:
                                events.append(event)
            except json.JSONDecodeError:
                continue

        # Fallback: Parse event cards from HTML if no JSON-LD
        if not events:
            event_links = soup.find_all('a', href=re.compile(r'/seattle/events/[^/]+'))
            seen_urls = set()

            for link in event_links[:20]:
                href = link.get('href', '')
                if href in seen_urls or not href:
                    continue
                seen_urls.add(href)

                title = link.get_text(strip=True)
                if not title or len(title) < 3:
                    continue

                full_url = f"https://everout.com{href}" if href.startswith('/') else href

                events.append(Event(
                    id=f"everout_{hashlib.md5(full_url.encode()).hexdigest()[:8]}",
                    title=title[:150],
                    url=full_url,
                    dateStart=datetime.now().strftime("%Y-%m-%d"),  # Placeholder
                    submittedBy="EverOut Seattle",
                    submittedAt=datetime.now().isoformat(),
                ))

        print(f"EverOut: extracted {len(events)} events")
    except Exception as e:
        print(f"EverOut scraper error: {type(e).__name__}: {e}")

    return events[:10]


async def scrape_mopop(client: httpx.AsyncClient, days: int = 7) -> list[Event]:
    """
    Scrape events from Museum of Pop Culture (MoPOP).
    """
    events = []
    try:
        url = "https://www.mopop.org/events"
        print(f"Fetching MoPOP: {url}")

        response = await client.get(url, headers=HTTP_HEADERS, follow_redirects=True, timeout=30.0)

        if response.status_code != 200:
            print(f"MoPOP returned {response.status_code}")
            return events

        soup = BeautifulSoup(response.text, 'html.parser')

        # Look for JSON-LD
        for script in soup.find_all('script', type='application/ld+json'):
            try:
                data = json.loads(script.string)
                if isinstance(data, list):
                    for item in data:
                        if item.get('@type') == 'Event':
                            date_start = item.get('startDate', '')[:10] if item.get('startDate') else ''
                            events.append(Event(
                                id=f"mopop_{hashlib.md5(item.get('url', item.get('name', '')).encode()).hexdigest()[:8]}",
                                title=item.get('name', '')[:150],
                                description=item.get('description', '')[:200] if item.get('description') else None,
                                url=item.get('url', url),
                                dateStart=date_start,
                                location="MoPOP",
                                submittedBy="MoPOP",
                                submittedAt=datetime.now().isoformat(),
                            ))
                elif data.get('@type') == 'Event':
                    date_start = data.get('startDate', '')[:10] if data.get('startDate') else ''
                    events.append(Event(
                        id=f"mopop_{hashlib.md5(data.get('url', data.get('name', '')).encode()).hexdigest()[:8]}",
                        title=data.get('name', '')[:150],
                        description=data.get('description', '')[:200] if data.get('description') else None,
                        url=data.get('url', url),
                        dateStart=date_start,
                        location="MoPOP",
                        submittedBy="MoPOP",
                        submittedAt=datetime.now().isoformat(),
                    ))
            except json.JSONDecodeError:
                continue

        # Fallback: Look for event cards in HTML
        if not events:
            # Look for common event card patterns
            for card in soup.find_all(['article', 'div'], class_=re.compile(r'event|card', re.I)):
                title_el = card.find(['h2', 'h3', 'h4', 'a'])
                if title_el:
                    title = title_el.get_text(strip=True)
                    link = card.find('a', href=True)
                    href = link.get('href', '') if link else ''

                    if title and len(title) > 3:
                        full_url = f"https://www.mopop.org{href}" if href.startswith('/') else (href or url)
                        events.append(Event(
                            id=f"mopop_{hashlib.md5(full_url.encode()).hexdigest()[:8]}",
                            title=title[:150],
                            url=full_url,
                            dateStart=datetime.now().strftime("%Y-%m-%d"),
                            location="MoPOP",
                            submittedBy="MoPOP",
                            submittedAt=datetime.now().isoformat(),
                        ))

        print(f"MoPOP: extracted {len(events)} events")
    except Exception as e:
        print(f"MoPOP scraper error: {type(e).__name__}: {e}")

    return events[:10]


async def scrape_seattle_met(client: httpx.AsyncClient, days: int = 7) -> list[Event]:
    """
    Scrape events from Seattle Met things to do.
    """
    events = []
    try:
        url = "https://www.seattlemet.com/arts-and-culture/things-to-do-in-seattle-events"
        print(f"Fetching Seattle Met: {url}")

        response = await client.get(url, headers=HTTP_HEADERS, follow_redirects=True, timeout=30.0)

        if response.status_code != 200:
            print(f"Seattle Met returned {response.status_code}")
            return events

        soup = BeautifulSoup(response.text, 'html.parser')

        # Look for JSON-LD
        for script in soup.find_all('script', type='application/ld+json'):
            try:
                data = json.loads(script.string)
                if isinstance(data, dict) and data.get('@type') == 'ItemList':
                    for item in data.get('itemListElement', []):
                        event_data = item.get('item', {})
                        if event_data.get('@type') == 'Event':
                            date_start = event_data.get('startDate', '')[:10] if event_data.get('startDate') else ''
                            events.append(Event(
                                id=f"seattlemet_{hashlib.md5(event_data.get('url', '').encode()).hexdigest()[:8]}",
                                title=event_data.get('name', '')[:150],
                                description=event_data.get('description', '')[:200] if event_data.get('description') else None,
                                url=event_data.get('url', url),
                                dateStart=date_start,
                                submittedBy="Seattle Met",
                                submittedAt=datetime.now().isoformat(),
                            ))
            except json.JSONDecodeError:
                continue

        # Fallback: Look for article cards
        if not events:
            for article in soup.find_all(['article', 'div'], class_=re.compile(r'event|article|card', re.I)):
                title_el = article.find(['h2', 'h3', 'h4'])
                if title_el:
                    title = title_el.get_text(strip=True)
                    link = article.find('a', href=True)
                    href = link.get('href', '') if link else ''

                    # Skip navigation items
                    if any(x in title.lower() for x in ['menu', 'search', 'subscribe', 'newsletter']):
                        continue

                    if title and len(title) > 5:
                        full_url = f"https://www.seattlemet.com{href}" if href.startswith('/') else (href or url)
                        events.append(Event(
                            id=f"seattlemet_{hashlib.md5(full_url.encode()).hexdigest()[:8]}",
                            title=title[:150],
                            url=full_url,
                            dateStart=datetime.now().strftime("%Y-%m-%d"),
                            submittedBy="Seattle Met",
                            submittedAt=datetime.now().isoformat(),
                        ))

        print(f"Seattle Met: extracted {len(events)} events")
    except Exception as e:
        print(f"Seattle Met scraper error: {type(e).__name__}: {e}")

    return events[:10]


async def scrape_seattle_gov(client: httpx.AsyncClient, days: int = 7) -> list[Event]:
    """
    Scrape events from Seattle.gov event calendar.
    """
    events = []
    try:
        url = "https://www.seattle.gov/event-calendar"
        print(f"Fetching Seattle.gov: {url}")

        response = await client.get(url, headers=HTTP_HEADERS, follow_redirects=True, timeout=30.0)

        if response.status_code != 200:
            print(f"Seattle.gov returned {response.status_code}")
            return events

        soup = BeautifulSoup(response.text, 'html.parser')

        # Look for JSON-LD
        for script in soup.find_all('script', type='application/ld+json'):
            try:
                data = json.loads(script.string)
                if isinstance(data, dict) and data.get('@type') == 'Event':
                    date_start = data.get('startDate', '')[:10] if data.get('startDate') else ''
                    events.append(Event(
                        id=f"seattlegov_{hashlib.md5(data.get('url', data.get('name', '')).encode()).hexdigest()[:8]}",
                        title=data.get('name', '')[:150],
                        description=data.get('description', '')[:200] if data.get('description') else None,
                        url=data.get('url', url),
                        dateStart=date_start,
                        submittedBy="Seattle.gov",
                        submittedAt=datetime.now().isoformat(),
                    ))
            except json.JSONDecodeError:
                continue

        # Fallback: Look for event listings
        if not events:
            for item in soup.find_all(['a', 'div', 'li'], class_=re.compile(r'event', re.I)):
                title = item.get_text(strip=True)
                href = item.get('href', '') if item.name == 'a' else ''

                if not href:
                    link = item.find('a', href=True)
                    href = link.get('href', '') if link else ''

                # Skip if too short or looks like navigation
                if not title or len(title) < 5 or len(title) > 150:
                    continue
                if any(x in title.lower() for x in ['more events', 'view all', 'calendar']):
                    continue

                full_url = f"https://www.seattle.gov{href}" if href.startswith('/') else (href or url)
                events.append(Event(
                    id=f"seattlegov_{hashlib.md5(full_url.encode()).hexdigest()[:8]}",
                    title=title[:150],
                    url=full_url,
                    dateStart=datetime.now().strftime("%Y-%m-%d"),
                    submittedBy="Seattle.gov",
                    submittedAt=datetime.now().isoformat(),
                ))

        print(f"Seattle.gov: extracted {len(events)} events")
    except Exception as e:
        print(f"Seattle.gov scraper error: {type(e).__name__}: {e}")

    return events[:10]


async def fetch_all_seattle_events(days: int = 7) -> list[Event]:
    """
    Fetch events from all Seattle sources.
    Includes polite delays between requests to respect rate limits.
    """
    all_events = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Fetch from all sources with polite delays between each
        try:
            everout = await scrape_everout_seattle(client, days)
            all_events.extend(everout)
        except Exception as e:
            print(f"EverOut failed: {e}")

        await asyncio.sleep(POLITE_DELAY)

        try:
            mopop = await scrape_mopop(client, days)
            all_events.extend(mopop)
        except Exception as e:
            print(f"MoPOP failed: {e}")

        await asyncio.sleep(POLITE_DELAY)

        try:
            seattle_met = await scrape_seattle_met(client, days)
            all_events.extend(seattle_met)
        except Exception as e:
            print(f"Seattle Met failed: {e}")

        await asyncio.sleep(POLITE_DELAY)

        try:
            seattle_gov = await scrape_seattle_gov(client, days)
            all_events.extend(seattle_gov)
        except Exception as e:
            print(f"Seattle.gov failed: {e}")

    return all_events
