"""Deep scrape test - extract actual event data from promising sources."""
import httpx
from bs4 import BeautifulSoup
import json
import re

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/json,application/xhtml+xml",
}

async def test_visit_seattle():
    """Visit Seattle has JSON-LD and event listings."""
    print("\n" + "="*60)
    print("VISIT SEATTLE - Deep Analysis")
    print("="*60)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get("https://visitseattle.org/events/", headers=HEADERS)
        soup = BeautifulSoup(response.text, 'html.parser')

        # Check JSON-LD
        json_ld = soup.find_all('script', type='application/ld+json')
        print(f"\nJSON-LD Scripts: {len(json_ld)}")
        for script in json_ld:
            try:
                data = json.loads(script.string)
                print(f"  Type: {data.get('@type', 'unknown')}")
                if isinstance(data, list):
                    print(f"  Items: {len(data)}")
                    for item in data[:3]:
                        print(f"    - {item.get('@type')}: {item.get('name', 'no name')[:50]}")
            except Exception as e:
                print(f"  Parse error: {e}")

        # Look for event cards/listings
        print("\nLooking for event patterns...")

        # Common patterns: article, card, event-item, listing
        event_containers = soup.find_all(['article', 'div'], class_=lambda c: c and any(
            term in str(c).lower() for term in ['event', 'card', 'listing', 'item']
        ))
        print(f"Found {len(event_containers)} potential event containers")

        # Show first few
        for i, container in enumerate(event_containers[:5]):
            title = container.find(['h2', 'h3', 'h4', 'a'])
            if title:
                text = title.get_text(strip=True)
                if text and len(text) > 3:
                    print(f"  {i+1}. {text[:60]}")
                    # Look for date
                    date_elem = container.find(class_=lambda c: c and 'date' in str(c).lower())
                    if date_elem:
                        print(f"      Date: {date_elem.get_text(strip=True)[:40]}")

async def test_stranger():
    """The Stranger - EverOut integration."""
    print("\n" + "="*60)
    print("THE STRANGER - Deep Analysis")
    print("="*60)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get("https://www.thestranger.com/things-to-do", headers=HEADERS)
        soup = BeautifulSoup(response.text, 'html.parser')

        # Check JSON-LD
        json_ld = soup.find_all('script', type='application/ld+json')
        print(f"\nJSON-LD Scripts: {len(json_ld)}")
        for script in json_ld:
            try:
                data = json.loads(script.string)
                print(f"  Type: {data.get('@type', 'unknown')}")
            except:
                pass

        # Look for event sections
        print("\nLooking for event patterns...")

        # Look for articles with event data
        articles = soup.find_all('article')
        print(f"Found {len(articles)} article elements")

        # Look for specific event classes
        event_items = soup.find_all(class_=lambda c: c and any(
            term in str(c).lower() for term in ['event', 'pick', 'listing']
        ))
        print(f"Found {len(event_items)} elements with event/pick/listing class")

        # Look for links to event pages
        event_links = soup.find_all('a', href=lambda h: h and '/events/' in h)
        print(f"Found {len(event_links)} links to /events/")

        # Show some event titles
        seen = set()
        for link in event_links[:10]:
            text = link.get_text(strip=True)
            if text and len(text) > 5 and text not in seen:
                seen.add(text)
                href = link.get('href', '')
                print(f"  - {text[:50]}")

async def test_stranger_api():
    """Check if Stranger/EverOut has an API endpoint."""
    print("\n" + "="*60)
    print("STRANGER/EVEROUT API CHECK")
    print("="*60)

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Try different API patterns
        apis = [
            "https://www.thestranger.com/api/events",
            "https://www.thestranger.com/api/v1/events",
            "https://everout.com/seattle/events/",  # Main page
        ]

        for url in apis:
            try:
                response = await client.get(url, headers=HEADERS, follow_redirects=True)
                print(f"\n{url}")
                print(f"  Status: {response.status_code}")
                if response.status_code == 200:
                    content_type = response.headers.get('content-type', '')
                    print(f"  Content-Type: {content_type}")
                    if 'json' in content_type:
                        data = response.json()
                        print(f"  Response type: {type(data)}")
                        if isinstance(data, dict):
                            print(f"  Keys: {list(data.keys())[:10]}")
            except Exception as e:
                print(f"\n{url}")
                print(f"  Error: {e}")

async def test_eventbrite_seattle():
    """Check Eventbrite for Seattle events."""
    print("\n" + "="*60)
    print("EVENTBRITE SEATTLE")
    print("="*60)

    async with httpx.AsyncClient(timeout=30.0) as client:
        url = "https://www.eventbrite.com/d/wa--seattle/events/"
        response = await client.get(url, headers=HEADERS, follow_redirects=True)
        print(f"Status: {response.status_code}")

        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')

            # JSON-LD
            json_ld = soup.find_all('script', type='application/ld+json')
            print(f"JSON-LD Scripts: {len(json_ld)}")
            for script in json_ld:
                try:
                    data = json.loads(script.string)
                    if isinstance(data, dict):
                        t = data.get('@type', 'unknown')
                        print(f"  Type: {t}")
                        if t == 'ItemList':
                            items = data.get('itemListElement', [])
                            print(f"  Items: {len(items)}")
                            for item in items[:5]:
                                event = item.get('item', {})
                                print(f"    - {event.get('name', 'no name')[:50]}")
                except:
                    pass

if __name__ == "__main__":
    import asyncio
    asyncio.run(test_visit_seattle())
    asyncio.run(test_stranger())
    asyncio.run(test_stranger_api())
    asyncio.run(test_eventbrite_seattle())
