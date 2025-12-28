import { Devvit, useState, useAsync, useForm } from '@devvit/public-api';
import { WeatherWidget } from './WeatherWidget.js';
import { EventService } from '../services/eventService.js';
import { getWeatherForecast } from '../services/weatherService.js';
import { UserEvent, EventSource, CommunityLink, WeatherForecast } from '../types/index.js';
import { isValidUrl, isLinkAllowed, parseAllowedDomains, sanitizeUrl } from '../utils/linkValidator.js';

/**
 * Main Community Hub Post Component
 */
export const CommunityPost = (context: Devvit.Context): JSX.Element => {
  const [activeTab, setActiveTab] = useState<string>('events');
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [timePeriod, setTimePeriod] = useState<number>(3); // 1, 3, or 7 days
  const [eventSource, setEventSource] = useState<string>('all'); // 'all' or 'community'

  // Load settings
  const { data: settingsData, loading: settingsLoading } = useAsync(async () => {
    const s = await context.settings.getAll();
    return JSON.stringify(s);
  });

  const settings = settingsData ? JSON.parse(settingsData) : null;

  // Load weather data
  const { data: weatherData } = useAsync(async () => {
    if (!settings?.weatherGridPoint) return null;
    try {
      const weather = await getWeatherForecast(settings.weatherGridPoint as string);
      return JSON.stringify(weather);
    } catch (error) {
      console.error('Failed to fetch weather:', error);
      return null;
    }
  }, { depends: [settingsData] });

  const weather: WeatherForecast | null = weatherData ? JSON.parse(weatherData) : null;

  // Parse event sources from settings
  const eventSources: EventSource[] = settings?.eventSources
    ? parseEventSources(settings.eventSources as string)
    : [];

  // Load events from wiki/Redis (scraped + user-submitted)
  const { data: eventsData, loading: eventsLoading } = useAsync(async () => {
    try {
      if (eventSource === 'community') {
        // Only user-submitted events
        const userEvents = await EventService.getUpcomingEvents(context, 15);
        // Filter by time period
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const endDate = new Date(now.getTime() + timePeriod * 24 * 60 * 60 * 1000);
        const filtered = userEvents.filter(e => {
          const eventDate = new Date(e.dateStart);
          return eventDate >= now && eventDate <= endDate;
        });
        return JSON.stringify(filtered);
      } else {
        // All events: scraped + user-submitted
        const [scrapedEvents, userEvents] = await Promise.all([
          EventService.getScrapedEvents(context, timePeriod),
          EventService.getUpcomingEvents(context, 10)
        ]);
        // Filter user events by time period too
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const endDate = new Date(now.getTime() + timePeriod * 24 * 60 * 60 * 1000);
        const filteredUserEvents = userEvents.filter(e => {
          const eventDate = new Date(e.dateStart);
          return eventDate >= now && eventDate <= endDate;
        });
        const allEvents = [...scrapedEvents, ...filteredUserEvents]
          .sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime())
          .slice(0, 20);
        return JSON.stringify(allEvents);
      }
    } catch (error) {
      console.error('Failed to fetch events:', error);
      return '[]';
    }
  }, { depends: [refreshKey, timePeriod, eventSource] });

  const events: UserEvent[] = eventsData ? JSON.parse(eventsData) : [];

  // Parse community links from settings
  const communityLinks: CommunityLink[] = settings?.communityLinks
    ? parseCommunityLinks(settings.communityLinks as string)
    : [];

  // Get subreddit name for dynamic URLs
  const { data: subredditName } = useAsync(async () => {
    return await context.reddit.getCurrentSubredditName();
  });

  const location = (settings?.weatherLocation as string) || 'Seattle, WA';
  const headerEmoji = (settings?.headerEmoji as string) || '🌲';
  const headerTitle = (settings?.headerTitle as string) || 'Seattle Community Hub';

  // Get allowed domains for URL validation
  const allowedDomainsStr = (settings?.allowedDomains as string) || '';
  const allowedDomains = parseAllowedDomains(allowedDomainsStr);

  // Submit Event Form using useForm hook
  const submitEventForm = useForm(
    {
      fields: [
        {
          name: 'title',
          label: 'Event Title',
          type: 'string',
          required: true,
        },
        {
          name: 'dateStart',
          label: 'Event Date (YYYY-MM-DD)',
          type: 'string',
          required: true,
        },
        {
          name: 'url',
          label: 'Event Link (https://)',
          type: 'string',
          required: true,
        },
        {
          name: 'description',
          label: 'Description (optional)',
          type: 'paragraph',
          required: false,
        },
      ],
      title: 'Submit a Community Event',
      acceptLabel: 'Submit',
      cancelLabel: 'Cancel',
    },
    async (data) => {
      // Validate title
      const title = data.title as string;
      if (!title || title.trim().length === 0) {
        context.ui.showToast({ text: 'Event title is required', appearance: 'neutral' });
        return;
      }

      // Validate date
      const dateStart = data.dateStart as string;
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateStart)) {
        context.ui.showToast({ text: 'Date must be in YYYY-MM-DD format', appearance: 'neutral' });
        return;
      }

      // Validate URL
      const url = data.url as string;
      if (!isValidUrl(url)) {
        context.ui.showToast({ text: 'Please enter a valid URL (https://)', appearance: 'neutral' });
        return;
      }

      if (!isLinkAllowed(url, allowedDomains)) {
        context.ui.showToast({
          text: 'URL domain not allowed. Use: eventbrite.com, meetup.com, facebook.com, or .gov sites',
          appearance: 'neutral'
        });
        return;
      }

      try {
        const currentUser = await context.reddit.getCurrentUser();
        const result = await EventService.addEvent(
          {
            title: title.trim(),
            description: (data.description as string) || '',
            url: sanitizeUrl(url),
            dateStart: dateStart,
            dateEnd: dateStart,
            submittedBy: currentUser?.username || 'anonymous',
          },
          context,
          false // Not auto-approved, needs mod review
        );

        if (result.success) {
          context.ui.showToast({ text: 'Event submitted for mod review!', appearance: 'success' });
          setRefreshKey(prev => prev + 1);
        } else {
          context.ui.showToast({ text: result.error || 'Failed to submit event', appearance: 'neutral' });
        }
      } catch (error) {
        console.error('Error submitting event:', error);
        context.ui.showToast({ text: 'Error submitting event', appearance: 'neutral' });
      }
    }
  );

  // Loading state
  if (settingsLoading) {
    return (
      <vstack padding="large" alignment="center middle" grow>
        <text size="medium" color="#888888">Loading Community Hub...</text>
      </vstack>
    );
  }

  return (
    <vstack height="100%" backgroundColor="#0e0e1a">
      {/* Header */}
      <hstack padding="medium" backgroundColor="#1a1a2e" alignment="center middle">
        <text size="xlarge">{headerEmoji}</text>
        <spacer size="small" />
        <text size="xlarge" weight="bold" color="white">{headerTitle}</text>
        <spacer size="small" />
        <text size="medium" color="#4da6ff">{location}</text>
      </hstack>

      {/* Tab Navigation */}
      <hstack padding="small" backgroundColor="#151528" gap="small" alignment="center">
        <TabButton label="Events" active={activeTab === 'events'} onPress={() => setActiveTab('events')} />
        <TabButton label="Weather" active={activeTab === 'weather'} onPress={() => setActiveTab('weather')} />
        <TabButton label="Links" active={activeTab === 'links'} onPress={() => setActiveTab('links')} />
      </hstack>

      {/* Content Area */}
      <vstack padding="medium" gap="medium" grow>
        {activeTab === 'events' ? (
          <vstack gap="small" grow>
            {/* Time Period Selector */}
            <hstack gap="small" alignment="center">
              <text size="xsmall" color="#666666">Show:</text>
              <hstack
                padding="xsmall"
                backgroundColor={timePeriod === 1 ? '#4da6ff' : '#252540'}
                cornerRadius="small"
                onPress={() => setTimePeriod(1)}
              >
                <text size="xsmall" color={timePeriod === 1 ? '#0e0e1a' : '#cccccc'}>Today</text>
              </hstack>
              <hstack
                padding="xsmall"
                backgroundColor={timePeriod === 3 ? '#4da6ff' : '#252540'}
                cornerRadius="small"
                onPress={() => setTimePeriod(3)}
              >
                <text size="xsmall" color={timePeriod === 3 ? '#0e0e1a' : '#cccccc'}>3 Days</text>
              </hstack>
              <hstack
                padding="xsmall"
                backgroundColor={timePeriod === 7 ? '#4da6ff' : '#252540'}
                cornerRadius="small"
                onPress={() => setTimePeriod(7)}
              >
                <text size="xsmall" color={timePeriod === 7 ? '#0e0e1a' : '#cccccc'}>Week</text>
              </hstack>
              <spacer grow />
              <hstack
                padding="xsmall"
                backgroundColor={eventSource === 'all' ? '#252540' : '#4da6ff'}
                cornerRadius="small"
                onPress={() => setEventSource(eventSource === 'all' ? 'community' : 'all')}
              >
                <text size="xsmall" color={eventSource === 'community' ? '#0e0e1a' : '#cccccc'}>
                  {eventSource === 'all' ? '🌐 All' : '👥 Community'}
                </text>
              </hstack>
            </hstack>

            {eventsLoading ? (
              <vstack padding="medium" alignment="center middle">
                <text size="small" color="#888888">Loading events...</text>
              </vstack>
            ) : events.length > 0 ? (
              <vstack gap="small">
                <text size="small" weight="bold" color="#888888">
                  {eventSource === 'community' ? 'COMMUNITY EVENTS' : 'UPCOMING EVENTS'}
                </text>
                {events.map((event) => (
                  <hstack
                    key={event.id}
                    gap="small"
                    padding="small"
                    backgroundColor="#1a1a2e"
                    cornerRadius="small"
                    onPress={() => { if (event.url) context.ui.navigateTo(event.url); }}
                  >
                    <vstack alignment="center middle" minWidth="45px">
                      <text size="xsmall" color="#4da6ff">
                        {new Date(event.dateStart).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                      </text>
                      <text size="large" weight="bold" color="white">
                        {new Date(event.dateStart).getDate()}
                      </text>
                    </vstack>
                    <vstack grow>
                      <text size="small" weight="bold" color="white">{event.title}</text>
                      <text size="xsmall" color="#666666">
                        {event.location ? `@ ${event.location}` : event.description ? event.description : `via ${event.submittedBy}`}
                      </text>
                    </vstack>
                    <text color="#4da6ff">→</text>
                  </hstack>
                ))}
              </vstack>
            ) : (
              <vstack padding="medium" alignment="center middle" backgroundColor="#1a1a2e" cornerRadius="medium">
                <text size="small" color="#888888">No upcoming events</text>
                <text size="xsmall" color="#666666">Be the first to submit one!</text>
              </vstack>
            )}

            {/* Submit Event Button */}
            <hstack
              padding="medium"
              backgroundColor="#4da6ff"
              cornerRadius="medium"
              alignment="center middle"
              onPress={() => context.ui.showForm(submitEventForm)}
            >
              <text size="medium" weight="bold" color="#0e0e1a">+ Submit Your Event</text>
            </hstack>
          </vstack>
        ) : null}

        {activeTab === 'weather' ? (
          <WeatherWidget forecast={weather} location={location} showMoon={true} />
        ) : null}

        {activeTab === 'links' ? (
          <vstack gap="medium" grow>
            {/* Event Calendars */}
            {eventSources.length > 0 ? (
              <vstack padding="medium" backgroundColor="#1a1a2e" cornerRadius="medium" gap="small">
                <text size="small" weight="bold" color="#888888">EVENT CALENDARS</text>
                {eventSources.map((source, idx) => (
                  <hstack
                    key={idx.toString()}
                    gap="small"
                    padding="small"
                    backgroundColor="#252540"
                    cornerRadius="small"
                    onPress={() => context.ui.navigateTo(source.url)}
                  >
                    <text size="medium">{source.icon}</text>
                    <text size="small" color="#4da6ff" grow>{source.name}</text>
                    <text color="#666666">→</text>
                  </hstack>
                ))}
              </vstack>
            ) : null}

            {/* Community Links */}
            <CommunityLinksSection context={context} links={communityLinks} subredditName={subredditName || 'SeattleWA'} />
          </vstack>
        ) : null}
      </vstack>

      {/* Footer */}
      <hstack padding="small" backgroundColor="#151528" alignment="center middle">
        <text size="xsmall" color="#666666">Hub Bot 9000</text>
      </hstack>
    </vstack>
  );
};

/**
 * Tab Button Component
 */
interface TabButtonProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

const TabButton = ({ label, active, onPress }: TabButtonProps): JSX.Element => {
  return (
    <hstack
      padding="small"
      backgroundColor={active ? '#4da6ff' : '#252540'}
      cornerRadius="medium"
      onPress={onPress}
    >
      <text size="small" weight={active ? 'bold' : 'regular'} color={active ? '#0e0e1a' : '#cccccc'}>
        {label}
      </text>
    </hstack>
  );
};

/**
 * Community Links Section - shows configured links + default subreddit links
 */
interface CommunityLinksSectionProps {
  context: Devvit.Context;
  links: CommunityLink[];
  subredditName: string;
}

const CommunityLinksSection = ({ context, links, subredditName }: CommunityLinksSectionProps): JSX.Element => {
  const wikiUrl = `https://www.reddit.com/r/${subredditName}/wiki/index`;
  const rulesUrl = `https://www.reddit.com/r/${subredditName}/about/rules`;

  return (
    <vstack padding="medium" backgroundColor="#1a1a2e" cornerRadius="medium" gap="small">
      <text size="small" weight="bold" color="#888888">COMMUNITY LINKS</text>

      {/* User-configured links */}
      {links.map((link, idx) => (
        <hstack
          key={idx.toString()}
          gap="small"
          padding="small"
          backgroundColor="#252540"
          cornerRadius="small"
          onPress={() => context.ui.navigateTo(link.url)}
        >
          <text size="medium">{link.icon}</text>
          <vstack grow>
            <text size="small" color="#4da6ff">{link.name}</text>
            {link.description ? (
              <text size="xsmall" color="#666666">{link.description}</text>
            ) : null}
          </vstack>
          <text color="#666666">→</text>
        </hstack>
      ))}

      {/* Default subreddit links - always shown */}
      <hstack
        gap="small"
        padding="small"
        backgroundColor="#252540"
        cornerRadius="small"
        onPress={() => context.ui.navigateTo(wikiUrl)}
      >
        <text size="medium">📚</text>
        <text size="small" color="#4da6ff" grow>Subreddit Wiki</text>
        <text color="#666666">→</text>
      </hstack>
      <hstack
        gap="small"
        padding="small"
        backgroundColor="#252540"
        cornerRadius="small"
        onPress={() => context.ui.navigateTo(rulesUrl)}
      >
        <text size="medium">📋</text>
        <text size="small" color="#4da6ff" grow>Community Rules</text>
        <text color="#666666">→</text>
      </hstack>
    </vstack>
  );
};

/**
 * Parse event sources from settings string (JSON format)
 */
function parseEventSources(sourcesText: string): EventSource[] {
  if (!sourcesText) return [];
  try {
    const parsed = JSON.parse(sourcesText);
    if (Array.isArray(parsed)) {
      return parsed.filter(s => s.url);
    }
    return [];
  } catch {
    return sourcesText.split('\n').filter(line => line.trim()).map(line => {
      const parts = line.split('|').map(p => p.trim());
      return { name: parts[0] || 'Event Source', url: parts[1] || '', icon: parts[2] || '📅' };
    }).filter(source => source.url);
  }
}

/**
 * Parse community links from settings string (JSON format)
 */
function parseCommunityLinks(linksText: string): CommunityLink[] {
  if (!linksText) return [];
  try {
    const parsed = JSON.parse(linksText);
    if (Array.isArray(parsed)) {
      return parsed.filter(l => l.url);
    }
    return [];
  } catch {
    return linksText.split('\n').filter(line => line.trim()).map(line => {
      const parts = line.split('|').map(p => p.trim());
      return { name: parts[0] || 'Link', url: parts[1] || '', icon: parts[2] || '🔗', description: parts[3] };
    }).filter(link => link.url);
  }
}
