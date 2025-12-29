// Event Fetcher - Gets community events via Gemini or scraper-service
// Can use either:
// 1. Gemini with Google Search grounding (BYOK, no extra infra)
// 2. Shared scraper-service on Cloud Run (for complex scraping needs)

import { TriggerContext, JobContext } from '@devvit/public-api';

type AppContext = TriggerContext | JobContext;

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

// Event from external source
export interface CommunityEvent {
  id: string;
  title: string;
  description?: string;
  dateStart: string;      // YYYY-MM-DD
  dateEnd?: string;
  location?: string;
  url?: string;
  source: string;         // 'gemini', 'eventbrite', 'ticketmaster', etc.
  category?: string;      // 'music', 'sports', 'community', etc.
}

/**
 * Fetch community events using Gemini's grounded search
 * This is the simplest approach - uses mod's Gemini API key
 */
export async function fetchEventsWithGemini(
  location: string,
  days: number,
  geminiApiKey: string,
  options?: {
    category?: string;
    maxResults?: number;
  }
): Promise<CommunityEvent[]> {
  if (!geminiApiKey) return [];

  const maxResults = options?.maxResults || 10;
  const category = options?.category || 'community events';

  const today = new Date().toISOString().split('T')[0];
  const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const prompt = `Find ${category} happening in ${location} between ${today} and ${endDate}.

Return a JSON array with up to ${maxResults} events:
[
  {
    "title": "Event Name",
    "description": "Brief description",
    "dateStart": "YYYY-MM-DD",
    "location": "Venue name or address",
    "url": "https://...",
    "category": "music/sports/community/etc"
  }
]

Only include events with confirmed dates. Return ONLY valid JSON, no markdown.
If no events found, return: []`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
          },
          tools: [{
            google_search_retrieval: {
              dynamic_retrieval_config: { mode: 'MODE_DYNAMIC' }
            }
          }],
        }),
      }
    );

    if (!response.ok) {
      console.error('Gemini event fetch error:', response.status);
      return [];
    }

    const data = await response.json() as GeminiResponse;
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    // Clean markdown code blocks
    if (text.startsWith('```')) {
      text = text.split('```')[1];
      if (text.startsWith('json')) text = text.slice(4);
    }
    text = text.trim();

    if (!text || text === '[]') return [];

    const events = JSON.parse(text) as Array<{
      title: string;
      description?: string;
      dateStart: string;
      dateEnd?: string;
      location?: string;
      url?: string;
      category?: string;
    }>;

    // Convert to CommunityEvent format
    return events.map((e, i) => ({
      id: `gem_${Date.now()}_${i}`,
      title: e.title,
      description: e.description,
      dateStart: e.dateStart,
      dateEnd: e.dateEnd,
      location: e.location,
      url: e.url,
      source: 'gemini',
      category: e.category,
    }));
  } catch (error) {
    console.error('Event fetch failed:', error);
    return [];
  }
}

/**
 * Fetch events from a shared scraper-service (Cloud Run)
 * Use this for more reliable scraping of specific sources
 */
export async function fetchEventsFromScraper(
  scraperUrl: string,
  location: string,
  state: string,
  days: number,
  apiKey?: string
): Promise<CommunityEvent[]> {
  if (!scraperUrl) return [];

  try {
    const url = new URL('/events', scraperUrl);
    url.searchParams.set('location', location);
    url.searchParams.set('state', state);
    url.searchParams.set('days', String(days));

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      console.error('Scraper-service error:', response.status);
      return [];
    }

    const data = await response.json() as {
      events: Array<{
        id: string;
        title: string;
        description?: string;
        dateStart: string;
        location?: string;
        url?: string;
        submittedBy: string;
      }>;
    };

    return data.events.map(e => ({
      id: e.id,
      title: e.title,
      description: e.description,
      dateStart: e.dateStart,
      location: e.location,
      url: e.url,
      source: e.submittedBy.toLowerCase(),
    }));
  } catch (error) {
    console.error('Scraper fetch failed:', error);
    return [];
  }
}

/**
 * Fetch events using Reddit's free AI (available in Devvit)
 * No API key required - uses Devvit's built-in AI
 */
export async function fetchEventsWithRedditAI(
  context: AppContext,
  location: string,
  days: number,
  options?: {
    category?: string;
    maxResults?: number;
  }
): Promise<CommunityEvent[]> {
  const maxResults = options?.maxResults || 10;
  const category = options?.category || 'community events';

  const today = new Date().toISOString().split('T')[0];
  const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const prompt = `Find ${category} happening in ${location} between ${today} and ${endDate}.
Return JSON array: [{"title":"Name","dateStart":"YYYY-MM-DD","location":"Venue","url":"https://..."}]
Up to ${maxResults} events. Real events only. JSON only, no markdown.`;

  try {
    // Check if Devvit AI is available
    const contextAny = context as { ai?: { generateText?: (opts: { prompt: string }) => Promise<string> } };
    if (contextAny.ai?.generateText) {
      const response = await contextAny.ai.generateText({ prompt });
      if (!response) return [];

      let text = response.trim();
      if (text.startsWith('```')) {
        text = text.split('```')[1];
        if (text.startsWith('json')) text = text.slice(4);
      }
      text = text.trim();

      if (!text || text === '[]') return [];

      const events = JSON.parse(text) as Array<{
        title: string;
        description?: string;
        dateStart: string;
        location?: string;
        url?: string;
        category?: string;
      }>;

      return events.map((e, i) => ({
        id: `reddit_${Date.now()}_${i}`,
        title: e.title,
        description: e.description,
        dateStart: e.dateStart,
        location: e.location,
        url: e.url,
        source: 'reddit-ai',
        category: e.category,
      }));
    }

    return [];
  } catch (error) {
    console.error('Reddit AI event fetch failed:', error);
    return [];
  }
}

/**
 * Fetch events using best available method
 * Priority: Reddit AI (free) > Gemini (BYOK) > Scraper-service
 */
export async function fetchCommunityEvents(
  context: AppContext,
  options: {
    location: string;
    state?: string;
    days?: number;
    geminiApiKey?: string;
    scraperUrl?: string;
    scraperApiKey?: string;
    useRedditAI?: boolean;
  }
): Promise<CommunityEvent[]> {
  const { location, state, days = 7, geminiApiKey, scraperUrl, scraperApiKey, useRedditAI = true } = options;

  // Try Reddit AI first (free, no API key needed)
  if (useRedditAI) {
    const events = await fetchEventsWithRedditAI(context, location, days);
    if (events.length > 0) {
      console.log(`[events] Fetched ${events.length} events via Reddit AI`);
      return events;
    }
  }

  // Try Gemini (uses existing BYOK key)
  if (geminiApiKey) {
    const events = await fetchEventsWithGemini(location, days, geminiApiKey);
    if (events.length > 0) {
      console.log(`[events] Fetched ${events.length} events via Gemini`);
      return events;
    }
  }

  // Fall back to scraper-service
  if (scraperUrl && state) {
    const events = await fetchEventsFromScraper(scraperUrl, location, state, days, scraperApiKey);
    if (events.length > 0) {
      console.log(`[events] Fetched ${events.length} events via scraper`);
      return events;
    }
  }

  console.log('[events] No events found from any source');
  return [];
}
