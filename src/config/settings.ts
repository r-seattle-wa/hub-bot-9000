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
        defaultValue: true,
      },
      {
        type: 'string',
        name: 'dailyPostTime',
        label: 'Daily Post Time (UTC)',
        helpText: 'Time to post daily thread in 24h format (e.g., 15:00)',
        defaultValue: '15:00',
      },
      {
        type: 'boolean',
        name: 'enableWeeklyPost',
        label: 'Enable Weekly Post',
        helpText: 'Automatically post a weekly roundup thread',
        defaultValue: true,
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
        helpText: 'Include weather forecast in posts',
        defaultValue: true,
      },
      {
        type: 'string',
        name: 'weatherGridPoint',
        label: 'NWS Grid Point',
        helpText: 'Format: OFFICE/X,Y (e.g., SEW/123,68 for Seattle)',
        defaultValue: 'SEW/123,68',
      },
      {
        type: 'string',
        name: 'weatherLocation',
        label: 'Location Name',
        helpText: 'Display name for your location',
        defaultValue: 'Seattle, WA',
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
        helpText: 'JSON array of event sources: [{"name": "...", "url": "...", "icon": "..."}]',
        defaultValue: JSON.stringify([
          { name: 'The Stranger / EverOut', url: 'https://everout.com/seattle/events/', icon: '🎭' },
          { name: 'MoPOP Events', url: 'https://www.mopop.org/events', icon: '🎸' },
          { name: 'Seattle Met', url: 'https://www.seattlemet.com/arts-and-culture/things-to-do-in-seattle-events', icon: '📰' },
          { name: 'Seattle.gov Events', url: 'https://www.seattle.gov/event-calendar', icon: '🏛️' },
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
        helpText: 'Comma-separated list of allowed domains for user-submitted event links',
        defaultValue: 'reddit.com, redd.it, eventbrite.com, meetup.com, facebook.com, seattle.gov, kingcounty.gov',
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
        helpText: 'JSON array of community links: [{"name": "...", "url": "...", "icon": "..."}]',
        defaultValue: JSON.stringify([
          { name: 'Discord', url: '', icon: '💬' },
          { name: 'Wiki', url: '', icon: '📚' },
          { name: 'Rules', url: '', icon: '📋' },
        ], null, 2),
      },
    ],
  },

  // Scraper Service
  {
    type: 'group',
    label: 'Event Scraper',
    fields: [
      {
        type: 'string',
        name: 'scraperUrl',
        label: 'Event Scraper URL',
        helpText: 'Cloud Run URL for the event scraper service (leave empty to disable)',
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
        defaultValue: 'Seattle Community Hub',
      },
      {
        type: 'string',
        name: 'headerEmoji',
        label: 'Hub Emoji',
        helpText: 'Emoji shown in the Community Hub header',
        defaultValue: '🌲',
      },
      {
        type: 'string',
        name: 'botName',
        label: 'Bot Name',
        helpText: 'Name displayed in posts',
        defaultValue: 'Community Hub Bot',
      },
      {
        type: 'string',
        name: 'postTitleDaily',
        label: 'Daily Post Title Template',
        helpText: 'Use {location}, {date}, {dayOfWeek}',
        defaultValue: '{location} Daily Community Thread - {dayOfWeek}, {date}',
      },
      {
        type: 'string',
        name: 'postTitleWeekly',
        label: 'Weekly Post Title Template',
        helpText: 'Use {location}, {date}, {weekOf}',
        defaultValue: '{location} Weekly Thread - Week of {weekOf}',
      },
    ],
  },
];
