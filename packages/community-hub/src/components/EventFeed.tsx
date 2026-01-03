import { Devvit, useState, useInterval } from '@devvit/public-api';
import {
  HubBotEvent,
  HubBotEventType,
  BrigadeAlertEvent,
  HaikuDetectionEvent,
  FarewellAnnouncementEvent,
  CourtDocketEvent,
  TrafficSpikeEvent,
  CommunityEventEvent,
  SystemEvent,
  SourceClassification,
  EVENT_FEED_WIKI_PAGE,
} from '@hub-bot/common';

const EVENT_COLORS: Record<string, string> = {
  brigade_alert: '#FF6B6B',
  haiku_detection: '#4ECDC4',
  farewell_announcement: '#FFE66D',
  court_docket: '#95E1D3',
  traffic_spike: '#FF9F43',
  community_event: '#9B59B6',
  system: '#A8E6CF',
};

const EVENT_ICONS: Record<string, string> = {
  brigade_alert: '!',
  haiku_detection: '*',
  farewell_announcement: '~',
  court_docket: '#',
  traffic_spike: '^',
  community_event: '@',
  system: 'i',
};

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

interface SimpleEvent {
  id: string;
  type: string;
  createdAt: number;
  summary: string;
  detail: string;
}

function toSimpleEvent(event: HubBotEvent): SimpleEvent {
  let summary = '';
  let detail = '';

  switch (event.type) {
    case HubBotEventType.BRIGADE_ALERT: {
      const e = event as BrigadeAlertEvent;
      summary = 'Link from r/' + e.sourceSubreddit;
      detail =
        e.classification === SourceClassification.HATEFUL
          ? 'HOSTILE'
          : e.classification === SourceClassification.ADVERSARIAL
            ? 'ADVERSE'
            : e.classification === SourceClassification.FRIENDLY
              ? 'FRIENDLY'
              : 'NEUTRAL';
      break;
    }
    case HubBotEventType.HAIKU_DETECTION: {
      const e = event as HaikuDetectionEvent;
      summary = 'Haiku by u/' + e.username;
      detail = (e.haiku.split('\n')[0] || '').substring(0, 30);
      break;
    }
    case HubBotEventType.FAREWELL_ANNOUNCEMENT: {
      const e = event as FarewellAnnouncementEvent;
      summary = 'Farewell u/' + e.username + ' (' + e.totalPosts + 'p/' + e.totalComments + 'c)';
      detail = e.isPowerUser ? 'Power User' : e.sarcasmUsed;
      break;
    }
    case HubBotEventType.COURT_DOCKET: {
      const e = event as CourtDocketEvent;
      summary = 'Case: ' + e.defendant;
      detail = e.charge.substring(0, 25);
      break;
    }
    case HubBotEventType.TRAFFIC_SPIKE: {
      const e = event as TrafficSpikeEvent;
      summary = 'SPIKE: ' + e.commentsInWindow + ' comments/' + e.windowMinutes + 'min';
      detail = e.postTitle ? e.postTitle.substring(0, 25) : e.postId;
      break;
    }
    case HubBotEventType.COMMUNITY_EVENT: {
      const e = event as CommunityEventEvent;
      summary = e.title.substring(0, 35);
      detail = e.eventDate + (e.location ? ' @ ' + e.location.substring(0, 15) : '');
      break;
    }
    case HubBotEventType.SYSTEM: {
      const e = event as SystemEvent;
      summary = e.message.substring(0, 40);
      detail = '';
      break;
    }
    default:
      summary = 'Event';
  }

  return {
    id: event.id,
    type: event.type,
    createdAt: event.createdAt,
    summary,
    detail,
  };
}

export const EventFeed: Devvit.CustomPostComponent = (context) => {
  const [eventsJson, setEventsJson] = useState<string>('[]');
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const events: SimpleEvent[] = JSON.parse(eventsJson);

  async function loadEvents() {
    try {
      const subreddit = await context.reddit.getCurrentSubreddit();
      const wikiPage = await context.reddit.getWikiPage(subreddit.name, EVENT_FEED_WIKI_PAGE);
      if (wikiPage && wikiPage.content) {
        const parsed = JSON.parse(wikiPage.content) as HubBotEvent[];
        const now = Date.now();
        const valid = parsed.filter((e) => e.expiresAt > now).slice(0, 10);
        const simple = valid.map(toSimpleEvent);
        setEventsJson(JSON.stringify(simple));
      } else {
        setEventsJson('[]');
      }
      setErrorMsg('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('WIKI_DISABLED') && !msg.includes('PAGE_NOT_FOUND')) {
        setErrorMsg(msg);
      }
      setEventsJson('[]');
    } finally {
      setLoading(false);
    }
  }

  if (loading && events.length === 0) {
    loadEvents();
  }

  useInterval(() => {
    loadEvents();
  }, 60000).start();

  if (loading && events.length === 0) {
    return (
      <vstack padding="medium" alignment="center middle" grow>
        <text weight="bold" size="large">
          Hub Bot Events
        </text>
        <spacer size="medium" />
        <text color="neutral-content-weak">Loading events...</text>
      </vstack>
    );
  }

  if (errorMsg) {
    return (
      <vstack padding="medium" alignment="center middle" grow>
        <text weight="bold" size="large">
          Hub Bot Events
        </text>
        <spacer size="medium" />
        <text color="neutral-content-weak">Could not load events</text>
        <text size="small" color="neutral-content-weak">
          {errorMsg}
        </text>
      </vstack>
    );
  }

  if (events.length === 0) {
    return (
      <vstack padding="medium" alignment="center middle" grow>
        <text weight="bold" size="large">
          Hub Bot Events
        </text>
        <spacer size="medium" />
        <text color="neutral-content-weak">No recent events</text>
        <text size="small" color="neutral-content-weak">
          Events appear when bots take action
        </text>
      </vstack>
    );
  }

  return (
    <vstack padding="small" gap="small" grow>
      <hstack alignment="center" gap="small">
        <text weight="bold" size="large">
          Hub Bot Events
        </text>
        <spacer grow />
        <text size="small" color="neutral-content-weak">
          {events.length} events
        </text>
      </hstack>
      <vstack gap="small" grow>
        {events.slice(0, 8).map((event) => (
          <hstack
            key={event.id}
            padding="small"
            cornerRadius="small"
            backgroundColor="neutral-background-weak"
            gap="small"
            alignment="middle"
          >
            <text size="xlarge" weight="bold" color={EVENT_COLORS[event.type] || 'neutral-content'}>
              {EVENT_ICONS[event.type] || '?'}
            </text>
            <vstack grow>
              <text size="small" weight="bold">
                {event.summary}
              </text>
              <text size="xsmall" color="neutral-content-weak">
                {event.detail}
              </text>
            </vstack>
            <text size="xsmall" color="neutral-content-weak">
              {formatTimeAgo(event.createdAt)}
            </text>
          </hstack>
        ))}
      </vstack>
      <hstack alignment="center">
        <text size="xsmall" color="neutral-content-weak">
          Auto-refreshes every 60s
        </text>
      </hstack>
    </vstack>
  );
};
