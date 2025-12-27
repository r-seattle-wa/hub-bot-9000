import { WeatherForecast } from '../types/index.js';

const NWS_BASE_URL = 'https://api.weather.gov';
const USER_AGENT = 'CommunityHubBot/1.0 (https://github.com/r-seattle-wa/community-hub-bot)';

/**
 * Fetch weather forecast from National Weather Service API
 * @param gridPoint - NWS grid point in format "OFFICE/X,Y" (e.g., "SEW/123,68")
 */
export async function getWeatherForecast(gridPoint: string): Promise<WeatherForecast | null> {
  try {
    const url = `${NWS_BASE_URL}/gridpoints/${gridPoint}/forecast`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/geo+json',
      },
    });

    if (!response.ok) {
      console.error(`NWS API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    return {
      periods: data.properties.periods.slice(0, 4).map((p: any) => ({
        name: p.name,
        temperature: p.temperature,
        temperatureUnit: p.temperatureUnit,
        shortForecast: p.shortForecast,
        detailedForecast: p.detailedForecast,
        isDaytime: p.isDaytime,
        startTime: p.startTime,
      })),
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Failed to fetch weather:', error);
    return null;
  }
}

/**
 * Get weather emoji based on forecast description
 */
export function getWeatherEmoji(shortForecast: string, isDaytime: boolean): string {
  const forecast = shortForecast.toLowerCase();

  if (forecast.includes('thunder')) return '⛈️';
  if (forecast.includes('rain') || forecast.includes('drizzle')) return '🌧️';
  if (forecast.includes('snow')) return '❄️';
  if (forecast.includes('fog')) return '🌫️';
  if (forecast.includes('cloudy') && forecast.includes('partly')) {
    return isDaytime ? '⛅' : '☁️';
  }
  if (forecast.includes('cloudy')) return '☁️';
  if (forecast.includes('sunny') || forecast.includes('clear')) {
    return isDaytime ? '☀️' : '🌙';
  }

  return isDaytime ? '🌤️' : '🌙';
}

/**
 * Format weather for display in post
 */
export function formatWeatherForPost(forecast: WeatherForecast): string {
  if (!forecast.periods.length) {
    return '🌡️ Weather data unavailable';
  }

  const lines = forecast.periods.slice(0, 2).map((period) => {
    const emoji = getWeatherEmoji(period.shortForecast, period.isDaytime);
    return `• **${period.name}**: ${emoji} ${period.shortForecast}, ${period.temperature}°${period.temperatureUnit}`;
  });

  return lines.join('\n');
}
