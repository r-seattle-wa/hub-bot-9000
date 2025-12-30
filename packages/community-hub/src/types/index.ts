// Event Types
export interface EventSource {
  name: string;
  url: string;
  icon: string;
}

export interface UserEvent {
  id: string;
  title: string;
  description?: string;
  url: string;
  dateStart: string; // ISO date string YYYY-MM-DD
  dateEnd?: string;
  location?: string; // Venue name
  submittedBy: string;
  submittedAt: string;
  approved: boolean;
}

export interface CommunityLink {
  name: string;
  url: string;
  icon: string;
  description?: string;
}

// Weather Types
export interface WeatherPeriod {
  name: string;
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;
  detailedForecast: string;
  isDaytime: boolean;
  startTime: string;
}

export interface WeatherForecast {
  periods: WeatherPeriod[];
  updatedAt: string;
}

// Moon Types
export interface MoonPhase {
  phase: 'New Moon' | 'First Quarter' | 'Full Moon' | 'Last Quarter';
  date: string;
  time: string;
}

// Settings Types
export interface AppSettings {
  // Scheduling
  enableDailyPost: boolean;
  dailyPostTime: string;
  enableWeeklyPost: boolean;
  weeklyPostDay: string;
  weeklyPostTime: string;

  // Weather
  enableWeather: boolean;
  weatherGridPoint: string;
  weatherLocation: string;

  // Events
  eventSources: EventSource[];
  enableUserEvents: boolean;
  maxUserEvents: number;
  allowedDomains: string[];

  // Community
  communityLinks: CommunityLink[];

  // Branding
  botName: string;
  postTitleDaily: string;
  postTitleWeekly: string;
}
