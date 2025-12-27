// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Devvit } from '@devvit/public-api';
import { WeatherForecast } from '../types/index.js';
import { getWeatherEmoji } from '../services/weatherService.js';
import { formatMoonPhase } from '../services/moonService.js';

interface WeatherWidgetProps {
  forecast: WeatherForecast | null;
  location: string;
  showMoon?: boolean;
}

export const WeatherWidget = ({ forecast, location, showMoon = true }: WeatherWidgetProps): JSX.Element => {
  if (!forecast || forecast.periods.length === 0) {
    return (
      <vstack padding="medium" backgroundColor="#1a1a2e" cornerRadius="medium">
        <hstack gap="small" alignment="middle">
          <text size="large">🌤️</text>
          <text size="medium" weight="bold" color="white">Weather - {location}</text>
        </hstack>
        <spacer size="small" />
        <text size="small" color="#999999">Weather data temporarily unavailable</text>
      </vstack>
    );
  }

  return (
    <vstack padding="medium" backgroundColor="#1a1a2e" cornerRadius="medium" gap="small">
      <hstack gap="small" alignment="middle">
        <text size="large">🌤️</text>
        <text size="medium" weight="bold" color="white">Weather - {location}</text>
      </hstack>

      <spacer size="small" />

      {forecast.periods.slice(0, 2).map((period) => {
        const emoji = getWeatherEmoji(period.shortForecast, period.isDaytime);
        return (
          <hstack gap="small" alignment="middle">
            <text size="medium">{emoji}</text>
            <vstack grow>
              <text size="small" weight="bold" color="white">{period.name}</text>
              <text size="small" color="#cccccc">
                {period.shortForecast}, {period.temperature}°{period.temperatureUnit}
              </text>
            </vstack>
          </hstack>
        );
      })}

      {showMoon ? (
        <vstack>
          <spacer size="small" />
          <hstack gap="small" alignment="middle">
            <text size="small" color="#888888">{formatMoonPhase()}</text>
          </hstack>
        </vstack>
      ) : null}
    </vstack>
  );
};
