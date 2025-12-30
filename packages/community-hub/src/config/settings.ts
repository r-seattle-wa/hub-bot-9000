import { SettingsFormField } from '@devvit/public-api';

export const appSettings: SettingsFormField[] = [
  // Scheduling Settings
  {
    type: 'group',
    label: 'Scheduled Posts',
    fields: [
      {
        type: 'boolean',
        name: 'enableDailyPost',
        label: 'Enable Daily Post',
        helpText: 'Automatically post a daily community thread',
        defaultValue: false,
      },
      {
        type: 'string',
        name: 'dailyPostTime',
        label: 'Daily Post Time (UTC)',
        helpText: 'Time to post daily thread in 24h format (e.g., 15:00 = 8am PST)',
        defaultValue: '15:00',
      },
      {
        type: 'boolean',
        name: 'enableWeeklyPost',
        label: 'Enable Weekly Post',
        helpText: 'Automatically post a weekly roundup thread',
        defaultValue: false,
      },
      {
        type: 'select',
        name: 'weeklyPostDay',
        label: 'Weekly Post Day',
        options: [
          { label: 'Sunday', value: '0' },
          { label: 'Monday', value: '1' },
          { label: 'Tuesday', value: '2' },
          { label: 'Wednesday', value: '3' },
          { label: 'Thursday', value: '4' },
          { label: 'Friday', value: '5' },
          { label: 'Saturday', value: '6' },
        ],
        defaultValue: ['1'],
      },
      {
        type: 'string',
        name: 'weeklyPostTime',
        label: 'Weekly Post Time (UTC)',
        helpText: 'Time to post weekly thread in 24h format',
        defaultValue: '15:00',
      },
    ],
  },

  // Weather Settings
  {
    type: 'group',
    label: 'Weather',
    fields: [
      {
        type: 'boolean',
        name: 'enableWeather',
        label: 'Enable Weather Forecast',
        helpText: 'Include weather forecast in posts (US only - uses weather.gov)',
        defaultValue: false,
      },
      {
        type: 'string',
        name: 'weatherGridPoint',
        label: 'NWS Grid Point',
        helpText: 'Find yours at weather.gov - Format: OFFICE/X,Y (e.g., SEW/123,68 for Seattle, LOX/154,44 for LA)',
        defaultValue: '',
      },
      {
        type: 'string',
        name: 'weatherLocation',
        label: 'Location Name',
        helpText: 'Display name for your location (e.g., "Portland, OR")',
        defaultValue: '',
      },
    ],
  },

  // Event Settings
  {
    type: 'group',
    label: 'Events',
    fields: [
      {
        type: 'paragraph',
        name: 'eventSources',
        label: 'Event Sources (JSON)',
        helpText: 'JSON array: [{"name": "Local Events", "url": "https://...", "icon": "📅"}]',
        defaultValue: JSON.stringify([
          { name: 'Example Events', url: 'https://www.eventbrite.com/', icon: '📅' },
        ], null, 2),
      },
      {
        type: 'boolean',
        name: 'enableUserEvents',
        label: 'Allow User Event Submissions',
        helpText: 'Let community members submit events (with link validation)',
        defaultValue: true,
      },
      {
        type: 'number',
        name: 'maxUserEvents',
        label: 'Max User Events to Display',
        helpText: 'Maximum number of user-submitted events to show',
        defaultValue: 10,
      },
      {
        type: 'paragraph',
        name: 'allowedDomains',
        label: 'Allowed Domains for User Links',
        helpText: 'Comma-separated domains users can link to',
        defaultValue: 'reddit.com, redd.it, eventbrite.com, meetup.com, facebook.com',
      },
    ],
  },

  // Community Links
  {
    type: 'group',
    label: 'Community Links',
    fields: [
      {
        type: 'paragraph',
        name: 'communityLinks',
        label: 'Community Links (JSON)',
        helpText: 'JSON array: [{"name": "Wiki", "url": "...", "icon": "📚", "description": "..."}]. Wiki/Rules auto-added.',
        defaultValue: '[]',
      },
    ],
  },

  // Scraper Service
  {
    type: 'group',
    label: 'Event Scraper (Advanced)',
    fields: [
      {
        type: 'string',
        name: 'scraperUrl',
        label: 'Event Scraper URL',
        helpText: 'Optional: Cloud Run URL for custom event scraper service',
        defaultValue: '',
      },
    ],
  },

  // Branding
  {
    type: 'group',
    label: 'Branding',
    fields: [
      {
        type: 'string',
        name: 'headerTitle',
        label: 'Hub Title',
        helpText: 'Title shown in the Community Hub header',
        defaultValue: 'Community Hub',
      },
      {
        type: 'string',
        name: 'headerEmoji',
        label: 'Hub Emoji',
        helpText: 'Emoji shown in the Community Hub header',
        defaultValue: '🏠',
      },
      {
        type: 'string',
        name: 'botName',
        label: 'Bot Name',
        helpText: 'Name displayed in posts',
        defaultValue: 'Community Hub',
      },
      {
        type: 'string',
        name: 'postTitleDaily',
        label: 'Daily Post Title Template',
        helpText: 'Variables: {location}, {date}, {dayOfWeek}, {subreddit}',
        defaultValue: '{location} Daily Thread - {dayOfWeek}, {date}',
      },
      {
        type: 'string',
        name: 'postTitleWeekly',
        label: 'Weekly Post Title Template',
        helpText: 'Variables: {location}, {date}, {weekOf}, {subreddit}',
        defaultValue: '{location} Weekly Thread - Week of {weekOf}',
      },
    ],
  },
];
