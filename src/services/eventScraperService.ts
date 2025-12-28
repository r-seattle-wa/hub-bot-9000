import { Devvit } from '@devvit/public-api';
import { UserEvent, EventSource } from '../types/index.js';

/**
 * Scrape events from external sources
 */
export class EventScraperService {
  /**
   * Fetch events from all configured sources for the next 3 days
   */
  static async fetchExternalEvents(
    sources: EventSource[],
    context: Devvit.Context
  ): Promise<UserEvent[]> {
    const allEvents: UserEvent[] = [];
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    for (const source of sources) {
      try {
        const events = await this.fetchFromSource(source, context);
        // Filter to next 3 days
        const filtered = events.filter(e => {
          const eventDate = new Date(e.dateStart);
          return eventDate >= now && eventDate <= threeDaysFromNow;
        });
        allEvents.push(...filtered);
      } catch (error) {
        console.error(`Failed to fetch from ${source.name}:`, error);
      }
    }

    // Sort by date
    allEvents.sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime());

    return allEvents;
  }

  /**
   * Fetch events from a single source
   */
  private static async fetchFromSource(
    source: EventSource,
    context: Devvit.Context
  ): Promise<UserEvent[]> {
    const url = source.url;

    // Route to appropriate parser based on domain
    if (url.includes('everout.com')) {
      return this.parseEverOut(url, source, context);
    } else if (url.includes('mopop.org')) {
      return this.parseMoPOP(url, source, context);
    } else if (url.includes('seattlemet.com')) {
      return this.parseSeattleMet(url, source, context);
    } else if (url.includes('seattle.gov')) {
      return this.parseSeattleGov(url, source, context);
    }

    return [];
  }

  /**
   * Parse EverOut Seattle events
   */
  private static async parseEverOut(
    url: string,
    source: EventSource,
    context: Devvit.Context
  ): Promise<UserEvent[]> {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'HubBot9000/1.0 (Reddit Community Bot)' }
      });
      const html = await response.text();

      const events: UserEvent[] = [];

      // Extract event cards - EverOut uses specific patterns
      // Look for event titles and dates in the HTML
      const eventPattern = /<a[^>]*href="(\/seattle\/events\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
      const datePattern = /(\w+ \d+)/g;

      let match;
      const year = new Date().getFullYear();

      while ((match = eventPattern.exec(html)) !== null && events.length < 10) {
        const eventUrl = `https://everout.com${match[1]}`;
        const title = match[2].trim();

        if (title && title.length > 3) {
          events.push({
            id: `everout-${events.length}`,
            title: title.slice(0, 100),
            url: eventUrl,
            dateStart: new Date().toISOString().split('T')[0], // Placeholder
            dateEnd: new Date().toISOString().split('T')[0],
            description: `via ${source.name}`,
            submittedBy: source.name,
            approved: true,
            submittedAt: new Date().toISOString(),
          });
        }
      }

      return events.slice(0, 5);
    } catch (error) {
      console.error('EverOut parse error:', error);
      return [];
    }
  }

  /**
   * Parse MoPOP events
   */
  private static async parseMoPOP(
    url: string,
    source: EventSource,
    context: Devvit.Context
  ): Promise<UserEvent[]> {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'HubBot9000/1.0 (Reddit Community Bot)' }
      });
      const html = await response.text();

      const events: UserEvent[] = [];

      // Look for event titles in MoPOP's structure
      const titlePattern = /<h[23][^>]*class="[^"]*event[^"]*"[^>]*>([^<]+)<\/h[23]>/gi;

      let match;
      while ((match = titlePattern.exec(html)) !== null && events.length < 5) {
        const title = match[1].trim();
        if (title && title.length > 3) {
          events.push({
            id: `mopop-${events.length}`,
            title: title.slice(0, 100),
            url: url,
            dateStart: new Date().toISOString().split('T')[0],
            dateEnd: new Date().toISOString().split('T')[0],
            description: `via ${source.name}`,
            submittedBy: source.name,
            approved: true,
            submittedAt: new Date().toISOString(),
          });
        }
      }

      return events;
    } catch (error) {
      console.error('MoPOP parse error:', error);
      return [];
    }
  }

  /**
   * Parse Seattle Met events
   */
  private static async parseSeattleMet(
    url: string,
    source: EventSource,
    context: Devvit.Context
  ): Promise<UserEvent[]> {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'HubBot9000/1.0 (Reddit Community Bot)' }
      });
      const html = await response.text();

      const events: UserEvent[] = [];

      // Generic event title extraction
      const titlePattern = /<h[234][^>]*>([^<]{5,80})<\/h[234]>/gi;

      let match;
      while ((match = titlePattern.exec(html)) !== null && events.length < 5) {
        const title = match[1].trim();
        // Filter out navigation/generic titles
        if (title && !title.includes('Menu') && !title.includes('Search') && !title.includes('Subscribe')) {
          events.push({
            id: `seattlemet-${events.length}`,
            title: title,
            url: url,
            dateStart: new Date().toISOString().split('T')[0],
            dateEnd: new Date().toISOString().split('T')[0],
            description: `via ${source.name}`,
            submittedBy: source.name,
            approved: true,
            submittedAt: new Date().toISOString(),
          });
        }
      }

      return events;
    } catch (error) {
      console.error('Seattle Met parse error:', error);
      return [];
    }
  }

  /**
   * Parse Seattle.gov events
   */
  private static async parseSeattleGov(
    url: string,
    source: EventSource,
    context: Devvit.Context
  ): Promise<UserEvent[]> {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'HubBot9000/1.0 (Reddit Community Bot)' }
      });
      const html = await response.text();

      const events: UserEvent[] = [];

      // Look for event listings
      const titlePattern = /<a[^>]*class="[^"]*event[^"]*"[^>]*>([^<]+)<\/a>/gi;

      let match;
      while ((match = titlePattern.exec(html)) !== null && events.length < 5) {
        const title = match[1].trim();
        if (title && title.length > 3) {
          events.push({
            id: `seattlegov-${events.length}`,
            title: title.slice(0, 100),
            url: url,
            dateStart: new Date().toISOString().split('T')[0],
            dateEnd: new Date().toISOString().split('T')[0],
            description: `via ${source.name}`,
            submittedBy: source.name,
            approved: true,
            submittedAt: new Date().toISOString(),
          });
        }
      }

      return events;
    } catch (error) {
      console.error('Seattle.gov parse error:', error);
      return [];
    }
  }
}
