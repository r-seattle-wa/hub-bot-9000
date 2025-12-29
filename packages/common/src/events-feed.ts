// Unified event feed for hub-bot-9000 apps
// Stores events in a shared wiki page for cross-app visibility

import { TriggerContext, ScheduledJobEvent } from '@devvit/public-api';
import {
  HubBotEvent,
  HubBotEventType,
  BrigadeAlertEvent,
  HaikuDetectionEvent,
  FarewellAnnouncementEvent,
  CourtDocketEvent,
  TrafficSpikeEvent,
  SystemEvent,
  SourceClassification,
  SarcasmLevel,
  UserTone,
} from './types.js';

// Wiki page for event feed storage
export const EVENT_FEED_WIKI_PAGE = 'hub-bot-9000/events-feed';

// Configuration
const MAX_EVENTS = 100; // Rolling window size
const DEFAULT_EXPIRY_DAYS = 7;

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get expiry timestamp for an event
 */
function getExpiryTimestamp(days: number = DEFAULT_EXPIRY_DAYS): number {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

/**
 * Read the event feed from wiki storage
 */
export async function readEventFeed(
  context: TriggerContext | { reddit: TriggerContext['reddit'] },
  subredditName: string
): Promise<HubBotEvent[]> {
  try {
    const wikiPage = await context.reddit.getWikiPage(subredditName, EVENT_FEED_WIKI_PAGE);
    if (!wikiPage || !wikiPage.content) {
      return [];
    }

    // Wiki content is JSON array of events
    const events: HubBotEvent[] = JSON.parse(wikiPage.content);
    return events;
  } catch (error: unknown) {
    // Wiki page doesn't exist or is invalid
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('WIKI_DISABLED') && !errorMessage.includes('PAGE_NOT_FOUND')) {
      console.error('[events-feed] Error reading event feed:', errorMessage);
    }
    return [];
  }
}

/**
 * Write events to wiki storage
 */
async function writeEventFeed(
  context: TriggerContext | { reddit: TriggerContext['reddit'] },
  subredditName: string,
  events: HubBotEvent[]
): Promise<void> {
  try {
    const content = JSON.stringify(events, null, 2);
    await context.reddit.updateWikiPage({
      subredditName,
      page: EVENT_FEED_WIKI_PAGE,
      content,
      reason: 'hub-bot-9000: Event feed update',
    });
  } catch (error: unknown) {
    // Try to create the wiki page if it doesn't exist
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('PAGE_NOT_FOUND') || errorMessage.includes('WIKI_DISABLED')) {
      try {
        await context.reddit.createWikiPage({
          subredditName,
          page: EVENT_FEED_WIKI_PAGE,
          content: JSON.stringify(events, null, 2),
        });
      } catch (createError) {
        console.error('[events-feed] Failed to create wiki page:', createError);
        throw createError;
      }
    } else {
      console.error('[events-feed] Error writing event feed:', errorMessage);
      throw error;
    }
  }
}

/**
 * Prune expired events from the feed
 */
export function pruneExpiredEvents(events: HubBotEvent[]): HubBotEvent[] {
  const now = Date.now();
  return events.filter((event) => event.expiresAt > now);
}

/**
 * Append a new event to the feed
 * Automatically prunes expired events and enforces rolling window
 */
export async function appendEvent<T extends HubBotEvent>(
  context: TriggerContext | { reddit: TriggerContext['reddit'] },
  subredditName: string,
  eventData: Omit<T, 'id' | 'createdAt' | 'expiresAt' | 'subreddit'>
): Promise<T> {
  // Read current events
  let events = await readEventFeed(context, subredditName);

  // Prune expired events
  events = pruneExpiredEvents(events);

  // Create the new event
  const newEvent = {
    ...eventData,
    id: generateEventId(),
    createdAt: Date.now(),
    expiresAt: getExpiryTimestamp(),
    subreddit: subredditName,
  } as T;

  // Add to front of list (newest first)
  events.unshift(newEvent);

  // Enforce rolling window
  if (events.length > MAX_EVENTS) {
    events = events.slice(0, MAX_EVENTS);
  }

  // Write back to wiki
  await writeEventFeed(context, subredditName, events);

  console.log(`[events-feed] Appended ${newEvent.type} event: ${newEvent.id}`);
  return newEvent;
}

/**
 * Get events filtered by type
 */
export async function getEventsByType(
  context: TriggerContext | { reddit: TriggerContext['reddit'] },
  subredditName: string,
  type: HubBotEventType
): Promise<HubBotEvent[]> {
  const events = await readEventFeed(context, subredditName);
  const pruned = pruneExpiredEvents(events);
  return pruned.filter((event) => event.type === type);
}

/**
 * Get recent events (limited count)
 */
export async function getRecentEvents(
  context: TriggerContext | { reddit: TriggerContext['reddit'] },
  subredditName: string,
  limit: number = 10
): Promise<HubBotEvent[]> {
  const events = await readEventFeed(context, subredditName);
  const pruned = pruneExpiredEvents(events);
  return pruned.slice(0, limit);
}

// ============================================
// Helper functions to create specific events
// ============================================

/**
 * Create a brigade alert event
 */
export async function emitBrigadeAlert(
  context: TriggerContext,
  subredditName: string,
  data: {
    sourceSubreddit: string;
    sourceUrl: string;
    targetPostId: string;
    classification: SourceClassification;
  }
): Promise<BrigadeAlertEvent> {
  return appendEvent<BrigadeAlertEvent>(context, subredditName, {
    type: HubBotEventType.BRIGADE_ALERT,
    sourceApp: 'brigade-sentinel',
    ...data,
  });
}

/**
 * Create a haiku detection event
 */
export async function emitHaikuDetection(
  context: TriggerContext,
  subredditName: string,
  data: {
    username: string;
    haiku: string;
    sourceId: string;
    isPost: boolean;
  }
): Promise<HaikuDetectionEvent> {
  return appendEvent<HaikuDetectionEvent>(context, subredditName, {
    type: HubBotEventType.HAIKU_DETECTION,
    sourceApp: 'haiku-sensei',
    ...data,
  });
}

/**
 * Create a farewell announcement event
 */
export async function emitFarewellAnnouncement(
  context: TriggerContext,
  subredditName: string,
  data: {
    username: string;
    totalPosts: number;
    totalComments: number;
    isPowerUser: boolean;
    sarcasmUsed: SarcasmLevel;
    detectedTone: UserTone;
  }
): Promise<FarewellAnnouncementEvent> {
  return appendEvent<FarewellAnnouncementEvent>(context, subredditName, {
    type: HubBotEventType.FAREWELL_ANNOUNCEMENT,
    sourceApp: 'farewell-hero',
    ...data,
  });
}

/**
 * Create a court docket event
 */
export async function emitCourtDocket(
  context: TriggerContext,
  subredditName: string,
  data: {
    defendant: string;
    charge: string;
    postUrl: string;
    postTitle: string;
  }
): Promise<CourtDocketEvent> {
  return appendEvent<CourtDocketEvent>(context, subredditName, {
    type: HubBotEventType.COURT_DOCKET,
    sourceApp: 'hub-widget',
    ...data,
  });
}

/**
 * Create a system event
 */
export async function emitSystemEvent(
  context: TriggerContext,
  subredditName: string,
  message: string,
  sourceApp: string = 'system'
): Promise<SystemEvent> {
  return appendEvent<SystemEvent>(context, subredditName, {
    type: HubBotEventType.SYSTEM,
    sourceApp,
    message,
  });
}
/**
 * Create a traffic spike event - unusual comment velocity detected
 */
export async function emitTrafficSpike(
  context: TriggerContext,
  subredditName: string,
  data: {
    postId: string;
    postTitle?: string;
    commentsInWindow: number;
    windowMinutes: number;
    threshold: number;
  }
): Promise<TrafficSpikeEvent> {
  return appendEvent<TrafficSpikeEvent>(context, subredditName, {
    type: HubBotEventType.TRAFFIC_SPIKE,
    sourceApp: 'brigade-sentinel',
    ...data,
  });
}
