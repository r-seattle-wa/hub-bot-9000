// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Devvit } from '@devvit/public-api';
import { UserEvent, EventSource } from '../types/index.js';

interface EventCalendarProps {
  events: UserEvent[];
  eventSources: EventSource[];
  onEventClick?: (event: UserEvent) => void;
  showSources?: boolean;
  maxEvents?: number;
}

export const EventCalendar = ({
  events,
  eventSources,
  onEventClick,
  showSources = true,
  maxEvents = 10,
}: EventCalendarProps): JSX.Element => {
  const displayEvents = events.slice(0, maxEvents);

  return (
    <vstack gap="medium" grow>
      {/* Event Sources */}
      {showSources && eventSources.length > 0 ? (
        <vstack padding="medium" backgroundColor="#1a1a2e" cornerRadius="medium" gap="small">
          <hstack gap="small" alignment="middle">
            <text size="large">🎭</text>
            <text size="medium" weight="bold" color="white">Find Events</text>
          </hstack>
          <spacer size="small" />
          {eventSources.map((source) => (
            <hstack gap="small" alignment="middle">
              <text size="small">{source.icon}</text>
              <text size="small" color="#4da6ff">
                {source.name}
              </text>
            </hstack>
          ))}
        </vstack>
      ) : null}

      {/* Community Events */}
      {displayEvents.length > 0 ? (
        <vstack padding="medium" backgroundColor="#1a1a2e" cornerRadius="medium" gap="small">
          <hstack gap="small" alignment="middle">
            <text size="large">📅</text>
            <text size="medium" weight="bold" color="white">Community Events</text>
          </hstack>
          <spacer size="small" />

          {displayEvents.map((event) => (
            <EventItem
              event={event}
              onClick={onEventClick}
            />
          ))}

          {events.length > maxEvents ? (
            <text size="small" color="#888888">
              +{events.length - maxEvents} more events
            </text>
          ) : null}
        </vstack>
      ) : null}

      {/* Empty state */}
      {displayEvents.length === 0 && !showSources ? (
        <vstack padding="medium" alignment="center middle">
          <text size="small" color="#888888">No upcoming events</text>
        </vstack>
      ) : null}
    </vstack>
  );
};

interface EventItemProps {
  event: UserEvent;
  onClick?: (event: UserEvent) => void;
}

const EventItem = ({ event, onClick }: EventItemProps): JSX.Element => {
  const eventDate = new Date(event.dateStart);

  return (
    <hstack
      gap="small"
      alignment="middle"
      padding="small"
      backgroundColor="#252540"
      cornerRadius="small"
      onPress={() => onClick?.(event)}
    >
      <vstack alignment="center middle" minWidth="50px">
        <text size="xsmall" color="#4da6ff" weight="bold">
          {eventDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
        </text>
        <text size="large" color="white" weight="bold">
          {eventDate.getDate().toString()}
        </text>
      </vstack>

      <vstack grow gap="none">
        <text size="small" weight="bold" color="white" wrap>
          {event.title}
        </text>
        {event.description ? (
          <text size="xsmall" color="#999999" wrap>
            {event.description.slice(0, 100)}
            {event.description.length > 100 ? '...' : ''}
          </text>
        ) : null}
      </vstack>

      <text size="small" color="#4da6ff">→</text>
    </hstack>
  );
};
