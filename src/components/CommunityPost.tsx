import { Devvit, useState, useAsync } from '@devvit/public-api';
import { WeatherWidget } from './WeatherWidget.js';
import { EventCalendar } from './EventCalendar.js';
import { createUserEventForm, validateEventForm, SubmitEventButton } from './UserEventForm.js';
import { EventService } from '../services/eventService.js';
import { getWeatherForecast } from '../services/weatherService.js';
import { UserEvent, EventSource, CommunityLink, WeatherForecast } from '../types/index.js';

/**
 * Main Community Hub Post Component
 * This is the interactive custom post that displays weather, events, and community links
 */
export const CommunityPost = (context: Devvit.Context): JSX.Element => {
  const [activeTab, setActiveTab] = useState<string>('events');
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Load settings
  const { data: settingsData, loading: settingsLoading } = useAsync(async () => {
    const s = await context.settings.getAll();
    return JSON.stringify(s);
  });

  // Parse settings from JSON string
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

  // Load events
  const { data: eventsData } = useAsync(async () => {
    try {
      const events = await EventService.getUpcomingEvents(context, 10);
      return JSON.stringify(events);
    } catch (error) {
      console.error('Failed to fetch events:', error);
      return '[]';
    }
  }, { depends: [refreshKey] });

  const events: UserEvent[] = eventsData ? JSON.parse(eventsData) : [];

  // Parse event sources from settings
  const eventSources: EventSource[] = settings?.eventSources
    ? parseEventSources(settings.eventSources as string)
    : [];

  // Parse community links from settings
  const communityLinks: CommunityLink[] = settings?.communityLinks
    ? parseCommunityLinks(settings.communityLinks as string)
    : [];

  const location = (settings?.locationName as string) || 'Your City';
  const headerEmoji = (settings?.headerEmoji as string) || '🏙️';
  const headerTitle = (settings?.headerTitle as string) || 'Community Hub';

  // Handle event submission
  const handleEventSubmit = async (formData: { values: Record<string, string> }) => {
    const validation = validateEventForm(formData.values);
    if (!validation.valid) {
      context.ui.showToast({ text: validation.error || 'Invalid form data', appearance: 'neutral' });
      return;
    }

    const currentUser = await context.reddit.getCurrentUser();
    const result = await EventService.addEvent(
      {
        title: formData.values.title,
        description: formData.values.description || '',
        url: formData.values.url,
        dateStart: formData.values.dateStart,
        dateEnd: formData.values.dateStart,
        submittedBy: currentUser?.username || 'anonymous',
      },
      context,
      false
    );

    if (result.success) {
      context.ui.showToast({ text: 'Event submitted for mod review!', appearance: 'success' });
      setRefreshKey(prev => prev + 1);
    } else {
      context.ui.showToast({ text: result.error || 'Failed to submit event', appearance: 'neutral' });
    }
  };

  // Create the form
  const eventForm = createUserEventForm(handleEventSubmit);

  const showSubmitForm = () => {
    context.ui.showForm(eventForm);
  };

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
        <TabButton
          label="Events"
          active={activeTab === 'events'}
          onPress={() => setActiveTab('events')}
        />
        <TabButton
          label="Weather"
          active={activeTab === 'weather'}
          onPress={() => setActiveTab('weather')}
        />
        <TabButton
          label="Links"
          active={activeTab === 'links'}
          onPress={() => setActiveTab('links')}
        />
      </hstack>

      {/* Content Area */}
      <vstack padding="medium" gap="medium" grow>
        {activeTab === 'events' && (
          <vstack gap="medium" grow>
            <EventCalendar
              events={events}
              eventSources={eventSources}
              showSources={true}
              maxEvents={8}
            />
            <SubmitEventButton onPress={showSubmitForm} />
          </vstack>
        )}

        {activeTab === 'weather' && (
          <WeatherWidget
            forecast={weather}
            location={location}
            showMoon={true}
          />
        )}

        {activeTab === 'links' && (
          <CommunityLinksPanel links={communityLinks} />
        )}
      </vstack>

      {/* Footer */}
      <hstack padding="small" backgroundColor="#151528" alignment="center middle">
        <text size="xsmall" color="#666666">
          Community Hub Bot
        </text>
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
 * Community Links Panel
 */
interface CommunityLinksPanelProps {
  links: CommunityLink[];
}

const CommunityLinksPanel = ({ links }: CommunityLinksPanelProps): JSX.Element => {
  if (links.length === 0) {
    return (
      <vstack padding="medium" backgroundColor="#1a1a2e" cornerRadius="medium" alignment="center middle">
        <text size="medium" color="#888888">No community links configured</text>
      </vstack>
    );
  }

  return (
    <vstack padding="medium" backgroundColor="#1a1a2e" cornerRadius="medium" gap="small">
      <hstack gap="small" alignment="middle">
        <text size="large">🔗</text>
        <text size="medium" weight="bold" color="white">Community Links</text>
      </hstack>
      <spacer size="small" />

      {links.map((link, index) => (
        <hstack
          key={index.toString()}
          padding="small"
          backgroundColor="#252540"
          cornerRadius="small"
          gap="small"
          alignment="middle"
        >
          <text size="medium">{link.icon}</text>
          <vstack grow>
            <text size="small" weight="bold" color="white">{link.name}</text>
            {link.description ? (
              <text size="xsmall" color="#999999">{link.description}</text>
            ) : null}
          </vstack>
          <text size="small" color="#4da6ff">→</text>
        </hstack>
      ))}
    </vstack>
  );
};

/**
 * Parse event sources from settings string
 * Format: "name|url|icon" per line
 */
function parseEventSources(sourcesText: string): EventSource[] {
  if (!sourcesText) return [];

  return sourcesText
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      const parts = line.split('|').map(p => p.trim());
      return {
        name: parts[0] || 'Event Source',
        url: parts[1] || '',
        icon: parts[2] || '📅',
      };
    })
    .filter(source => source.url);
}

/**
 * Parse community links from settings string
 * Format: "name|url|icon|description" per line
 */
function parseCommunityLinks(linksText: string): CommunityLink[] {
  if (!linksText) return [];

  return linksText
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      const parts = line.split('|').map(p => p.trim());
      return {
        name: parts[0] || 'Link',
        url: parts[1] || '',
        icon: parts[2] || '🔗',
        description: parts[3],
      };
    })
    .filter(link => link.url);
}
