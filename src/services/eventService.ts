import { Devvit } from '@devvit/public-api';
import { UserEvent } from '../types/index.js';
import { isLinkAllowed, parseAllowedDomains, sanitizeUrl } from '../utils/linkValidator.js';

const EVENTS_KEY = 'user_events';
const SCRAPED_EVENTS_KEY = 'scraped_events';
const WIKI_PAGE_NAME = 'hub-bot-events'; // Wiki page for scraped events

/**
 * Event Service - handles CRUD operations for user-submitted events
 * Also handles cached events from Cloud Run scraper
 */
export class EventService {
  /**
   * Get all events from Redis
   */
  static async getAllEvents(context: Devvit.Context): Promise<Record<string, UserEvent>> {
    try {
      const eventsJson = await context.redis.get(EVENTS_KEY);
      if (!eventsJson) return {};
      return JSON.parse(eventsJson);
    } catch (error) {
      console.error('Failed to get events:', error);
      return {};
    }
  }

  /**
   * Get a single event by ID
   */
  static async getEvent(eventId: string, context: Devvit.Context): Promise<UserEvent | null> {
    const events = await this.getAllEvents(context);
    return events[eventId] || null;
  }

  /**
   * Get approved events only
   */
  static async getApprovedEvents(context: Devvit.Context): Promise<UserEvent[]> {
    const events = await this.getAllEvents(context);
    return Object.values(events)
      .filter(e => e.approved)
      .sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime());
  }

  /**
   * Get pending (unapproved) events
   */
  static async getPendingEvents(context: Devvit.Context): Promise<UserEvent[]> {
    const events = await this.getAllEvents(context);
    return Object.values(events)
      .filter(e => !e.approved)
      .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
  }

  /**
   * Get upcoming events (approved, future dates)
   */
  static async getUpcomingEvents(context: Devvit.Context, limit: number = 10): Promise<UserEvent[]> {
    const events = await this.getApprovedEvents(context);
    const now = new Date();

    return events
      .filter(e => new Date(e.dateStart) >= now)
      .slice(0, limit);
  }

  /**
   * Get scraped events - tries wiki first, falls back to Redis cache
   * @param daysAhead - Number of days to look ahead (1, 3, or 7)
   */
  static async getScrapedEvents(context: Devvit.Context, daysAhead: number = 3): Promise<UserEvent[]> {
    try {
      let events: UserEvent[] = [];

      // Try reading from wiki first
      try {
        const subredditName = await context.reddit.getCurrentSubredditName();
        const wikiPage = await context.reddit.getWikiPage(subredditName, WIKI_PAGE_NAME);

        if (wikiPage && wikiPage.content) {
          const wikiData = JSON.parse(wikiPage.content);
          events = wikiData.events || [];
          console.log(`Loaded ${events.length} events from wiki`);
        }
      } catch {
        // Wiki page might not exist yet, fall back to Redis
        console.log('Wiki page not found, falling back to Redis cache');
        const eventsJson = await context.redis.get(SCRAPED_EVENTS_KEY);
        if (eventsJson) {
          events = JSON.parse(eventsJson);
        }
      }

      if (events.length === 0) return [];

      // Filter to requested time period
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Start of today
      const endDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

      return events
        .filter(e => {
          const eventDate = new Date(e.dateStart);
          return eventDate >= now && eventDate <= endDate;
        })
        .sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime());
    } catch (error) {
      console.error('Failed to get scraped events:', error);
      return [];
    }
  }

  /**
   * Save scraped events from Cloud Run (called by scheduler job)
   */
  static async saveScrapedEvents(events: UserEvent[], context: Devvit.Context): Promise<void> {
    try {
      await context.redis.set(SCRAPED_EVENTS_KEY, JSON.stringify(events));
      console.log(`Saved ${events.length} scraped events to cache`);
    } catch (error) {
      console.error('Failed to save scraped events:', error);
    }
  }

  /**
   * Add a new event (submitted by user)
   */
  static async addEvent(
    event: Omit<UserEvent, 'id' | 'submittedAt' | 'approved'>,
    context: Devvit.Context,
    autoApprove: boolean = false
  ): Promise<{ success: boolean; error?: string; event?: UserEvent }> {
    // Validate URL
    const settings = await context.settings.getAll();
    const allowedDomains = parseAllowedDomains(settings.allowedDomains as string);

    if (!isLinkAllowed(event.url, allowedDomains)) {
      return {
        success: false,
        error: 'Link must be from an approved domain (Eventbrite, Meetup, Facebook Events, government sites, etc.)',
      };
    }

    // Validate date
    const eventDate = new Date(event.dateStart);
    if (isNaN(eventDate.getTime())) {
      return { success: false, error: 'Invalid date format' };
    }

    // Don't allow past events
    if (eventDate < new Date()) {
      return { success: false, error: 'Event date must be in the future' };
    }

    // Create the event
    const newEvent: UserEvent = {
      id: generateEventId(),
      title: event.title.slice(0, 200), // Limit title length
      description: event.description?.slice(0, 500), // Limit description
      url: sanitizeUrl(event.url),
      dateStart: event.dateStart,
      dateEnd: event.dateEnd,
      submittedBy: event.submittedBy,
      submittedAt: new Date().toISOString(),
      approved: autoApprove,
    };

    // Save to Redis
    const events = await this.getAllEvents(context);
    events[newEvent.id] = newEvent;
    await context.redis.set(EVENTS_KEY, JSON.stringify(events));

    return { success: true, event: newEvent };
  }

  /**
   * Update an existing event
   */
  static async updateEvent(
    eventId: string,
    updates: Partial<UserEvent>,
    context: Devvit.Context
  ): Promise<{ success: boolean; error?: string }> {
    const events = await this.getAllEvents(context);

    if (!events[eventId]) {
      return { success: false, error: 'Event not found' };
    }

    // If URL is being updated, validate it
    if (updates.url) {
      const settings = await context.settings.getAll();
      const allowedDomains = parseAllowedDomains(settings.allowedDomains as string);

      if (!isLinkAllowed(updates.url, allowedDomains)) {
        return { success: false, error: 'Link must be from an approved domain' };
      }
      updates.url = sanitizeUrl(updates.url);
    }

    // Apply updates
    events[eventId] = { ...events[eventId], ...updates };
    await context.redis.set(EVENTS_KEY, JSON.stringify(events));

    return { success: true };
  }

  /**
   * Approve an event
   */
  static async approveEvent(eventId: string, context: Devvit.Context): Promise<{ success: boolean; error?: string }> {
    return this.updateEvent(eventId, { approved: true }, context);
  }

  /**
   * Reject/delete an event
   */
  static async deleteEvent(eventId: string, context: Devvit.Context): Promise<{ success: boolean; error?: string }> {
    const events = await this.getAllEvents(context);

    if (!events[eventId]) {
      return { success: false, error: 'Event not found' };
    }

    delete events[eventId];
    await context.redis.set(EVENTS_KEY, JSON.stringify(events));

    return { success: true };
  }

  /**
   * Clean up expired events (past dates)
   */
  static async cleanupExpiredEvents(context: Devvit.Context): Promise<number> {
    const events = await this.getAllEvents(context);
    const now = new Date();
    let removedCount = 0;

    // Keep events for 1 day after they end
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - 1);

    for (const [id, event] of Object.entries(events)) {
      const eventEnd = event.dateEnd ? new Date(event.dateEnd) : new Date(event.dateStart);
      if (eventEnd < cutoffDate) {
        delete events[id];
        removedCount++;
      }
    }

    if (removedCount > 0) {
      await context.redis.set(EVENTS_KEY, JSON.stringify(events));
    }

    return removedCount;
  }
}

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
