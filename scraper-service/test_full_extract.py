"""Full extraction test - get complete event data from working sources."""
import httpx
from bs4 import BeautifulSoup
import json
from datetime import datetime, timedelta
import re

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/json,application/xhtml+xml",
}

async def extract_eventbrite():
    """Extract events from Eventbrite's JSON-LD."""
    print("\n" + "="*60)
    print("EVENTBRITE - Full Extraction")
    print("="*60)

    events = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        url = "https://www.eventbrite.com/d/wa--seattle/events/"
        response = await client.get(url, headers=HEADERS, follow_redirects=True)

        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')

            for script in soup.find_all('script', type='application/ld+json'):
                try:
                    data = json.loads(script.string)
                    if isinstance(data, dict) and data.get('@type') == 'ItemList':
                        for item in data.get('itemListElement', []):
                            event_data = item.get('item', {})
                            if event_data.get('@type') == 'Event':
                                events.append({
                                    'title': event_data.get('name', ''),
                                    'url': event_data.get('url', ''),
                                    'date': event_data.get('startDate', ''),
                                    'location': event_data.get('location', {}).get('name', ''),
                                    'image': event_data.get('image', ''),
                                    'source': 'Eventbrite',
                                })
                except Exception as e:
                    print(f"Parse error: {e}")

    print(f"Extracted {len(events)} events")
    for e in events[:10]:
        print(f"\n  Title: {e['title'][:50]}")
        print(f"  Date: {e['date']}")
        print(f"  Location: {e['location'][:40] if e['location'] else 'N/A'}")
        print(f"  URL: {e['url'][:60]}...")

    return events

async def extract_visit_seattle():
    """Extract events from Visit Seattle HTML."""
    print("\n" + "="*60)
    print("VISIT SEATTLE - Full Extraction")
    print("="*60)

    events = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get("https://visitseattle.org/events/", headers=HEADERS)
        soup = BeautifulSoup(response.text, 'html.parser')

        # Find event cards - they have a specific pattern
        event_cards = soup.find_all('div', class_=lambda c: c and 'card' in str(c).lower())

        seen_titles = set()
        for card in event_cards:
            title_elem = card.find(['h3', 'h4', 'a'], class_=lambda c: c and 'title' in str(c).lower())
            if not title_elem:
                title_elem = card.find(['h3', 'h4'])

            if title_elem:
                title = title_elem.get_text(strip=True)
                if title and len(title) > 3 and title not in seen_titles:
                    seen_titles.add(title)

                    # Get link
                    link = card.find('a', href=True)
                    url = link.get('href', '') if link else ''
                    if url and not url.startswith('http'):
                        url = 'https://visitseattle.org' + url

                    # Get date if available
                    date_elem = card.find(class_=lambda c: c and 'date' in str(c).lower())
                    date = date_elem.get_text(strip=True) if date_elem else ''

                    events.append({
                        'title': title,
                        'url': url,
                        'date': date,
                        'location': 'Seattle',
                        'source': 'Visit Seattle',
                    })

    print(f"Extracted {len(events)} events")
    for e in events[:10]:
        print(f"\n  Title: {e['title'][:50]}")
        print(f"  Date: {e['date'] or 'N/A'}")
        print(f"  URL: {e['url'][:60] if e['url'] else 'N/A'}...")

    return events

async def test_ticketmaster_api():
    """Test Ticketmaster Discovery API (free tier)."""
    print("\n" + "="*60)
    print("TICKETMASTER API TEST")
    print("="*60)

    # Note: Needs an API key from https://developer.ticketmaster.com/
    # Free tier: 5000 requests/day
    print("Ticketmaster requires an API key.")
    print("Get one free at: https://developer.ticketmaster.com/")
    print("Free tier: 5000 requests/day")

    # Example API call structure:
    # GET https://app.ticketmaster.com/discovery/v2/events.json
    # ?apikey=YOUR_KEY
    # &city=Seattle
    # &stateCode=WA
    # &startDateTime=2024-01-01T00:00:00Z
    # &endDateTime=2024-01-07T23:59:59Z

async def test_meetup_api():
    """Test Meetup's GraphQL API."""
    print("\n" + "="*60)
    print("MEETUP API TEST")
    print("="*60)

    # Meetup now uses GraphQL and requires OAuth
    # But we can try the public web endpoint
    async with httpx.AsyncClient(timeout=30.0) as client:
        url = "https://www.meetup.com/find/?location=us--wa--Seattle&source=EVENTS"
        response = await client.get(url, headers=HEADERS, follow_redirects=True)
        print(f"Status: {response.status_code}")

        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')

            # Look for JSON data in script tags
            scripts = soup.find_all('script', type='application/json')
            print(f"Found {len(scripts)} JSON script tags")

            # Look for Next.js data
            next_data = soup.find('script', id='__NEXT_DATA__')
            if next_data:
                try:
                    data = json.loads(next_data.string)
                    props = data.get('props', {}).get('pageProps', {})
                    events = props.get('events', [])
                    print(f"Found {len(events)} events in Next.js data")
                    for e in events[:5]:
                        print(f"  - {e.get('title', 'no title')[:50]}")
                except Exception as ex:
                    print(f"Parse error: {ex}")

async def test_predicthq():
    """Test PredictHQ events API."""
    print("\n" + "="*60)
    print("PREDICTHQ API TEST")
    print("="*60)
    print("PredictHQ requires an API key.")
    print("Get one at: https://www.predicthq.com/ (free tier available)")

if __name__ == "__main__":
    import asyncio

    async def main():
        eb_events = await extract_eventbrite()
        vs_events = await extract_visit_seattle()
        await test_ticketmaster_api()
        await test_meetup_api()
        await test_predicthq()

        print("\n" + "="*60)
        print("SUMMARY")
        print("="*60)
        print(f"Eventbrite: {len(eb_events)} events with structured data")
        print(f"Visit Seattle: {len(vs_events)} events from HTML")
        print("\nRecommended sources:")
        print("1. Eventbrite - JSON-LD structured data (no API key needed)")
        print("2. Visit Seattle - HTML parsing (no API key needed)")
        print("3. Ticketmaster - Free API (5000 req/day, needs key)")
        print("4. Meetup - Requires OAuth")

    asyncio.run(main())
