"""Quick test of scraping sources - look for APIs."""
import httpx
from bs4 import BeautifulSoup
import json
import re

SOURCES = [
    ("EverOut API", "https://everout.com/api/events/?location=seattle&page=1"),
    ("Seattle.gov Calendar", "https://www.seattle.gov/event-calendar/public-outreach-and-engagement-calendar"),
    ("Visit Seattle", "https://visitseattle.org/events/"),
    ("Seattle Times", "https://www.seattletimes.com/things-to-do/"),
    ("Stranger Things To Do", "https://www.thestranger.com/things-to-do"),
]

async def test_scrape():
    async with httpx.AsyncClient(timeout=30.0) as client:
        for name, url in SOURCES:
            print(f"\n{'='*60}")
            print(f"Testing: {name}")
            print(f"URL: {url}")
            print('='*60)

            try:
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "text/html,application/json,application/xhtml+xml",
                }
                response = await client.get(url, headers=headers, follow_redirects=True)
                print(f"Status: {response.status_code}")
                print(f"Content-Type: {response.headers.get('content-type', 'unknown')}")

                if response.status_code == 200:
                    content = response.text
                    print(f"Size: {len(content)} bytes")

                    # Check if JSON
                    if 'json' in response.headers.get('content-type', ''):
                        data = response.json()
                        print(f"JSON response with {len(data) if isinstance(data, list) else 'object'} items")
                        if isinstance(data, dict):
                            print(f"Keys: {list(data.keys())[:10]}")
                    else:
                        soup = BeautifulSoup(content, 'html.parser')

                        # Look for JSON-LD structured data
                        json_ld = soup.find_all('script', type='application/ld+json')
                        if json_ld:
                            print(f"Found {len(json_ld)} JSON-LD scripts (structured data)")
                            for script in json_ld[:2]:
                                try:
                                    data = json.loads(script.string)
                                    if isinstance(data, dict):
                                        print(f"  Type: {data.get('@type', 'unknown')}")
                                except:
                                    pass

                        # Look for data attributes
                        data_attrs = soup.find_all(attrs={"data-events": True})
                        print(f"Found {len(data_attrs)} elements with data-events attr")

                        # Count headings that might be events
                        h2s = soup.find_all('h2')
                        h3s = soup.find_all('h3')
                        print(f"Found {len(h2s)} h2, {len(h3s)} h3 tags")

                        # Show some h2/h3 content
                        for h in (h2s + h3s)[:5]:
                            text = h.get_text(strip=True)
                            if len(text) > 5 and len(text) < 100:
                                print(f"  - {text[:60]}")

            except Exception as e:
                print(f"Error: {type(e).__name__}: {e}")

if __name__ == "__main__":
    import asyncio
    asyncio.run(test_scrape())
