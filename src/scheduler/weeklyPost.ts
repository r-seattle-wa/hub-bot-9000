import { JobContext } from '@devvit/public-api';
import { getWeatherForecast, formatWeatherForPost } from '../services/weatherService.js';
import { formatMoonPhase } from '../services/moonService.js';
import { formatWeekRange, getWeekStart } from '../utils/dateUtils.js';
import { EventSource, CommunityLink } from '../types/index.js';

/**
 * Generate and post the weekly community thread
 */
export async function handleWeeklyPost(_: unknown, context: JobContext): Promise<void> {
  console.log('Running weekly post job...');

  try {
    const settings = await context.settings.getAll();

    // Check if weekly posts are enabled
    if (!settings.enableWeeklyPost) {
      console.log('Weekly posts are disabled, skipping.');
      return;
    }

    const subredditName = await context.reddit.getCurrentSubredditName();
    const now = new Date();

    // Build post title
    const title = buildWeeklyTitle(
      settings.postTitleWeekly as string || '{location} Weekly Thread - Week of {weekOf}',
      settings.weatherLocation as string || 'Community',
      now
    );

    // Build post body
    const body = await buildWeeklyPostBody(settings, context);

    // Create the post
    const post = await context.reddit.submitPost({
      subredditName,
      title,
      text: body,
    });

    console.log(`Weekly post created: ${post.id}`);

  } catch (error) {
    console.error('Failed to create weekly post:', error);
  }
}

/**
 * Build the weekly post title from template
 */
function buildWeeklyTitle(template: string, location: string, date: Date): string {
  const weekStart = getWeekStart(date);
  const weekOf = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return template
    .replace('{location}', location)
    .replace('{weekOf}', weekOf)
    .replace('{date}', formatWeekRange(date));
}

/**
 * Build the weekly post body content
 */
async function buildWeeklyPostBody(settings: Record<string, unknown>, context: JobContext): Promise<string> {
  const sections: string[] = [];
  const now = new Date();

  // Header
  sections.push(`# Welcome to this week's community thread!\n`);
  sections.push(`**${formatWeekRange(now)}**\n`);
  sections.push(`Use this thread to discuss anything happening this week, share events, ask questions, or just chat with your community.\n`);

  // Weather outlook
  if (settings.enableWeather) {
    const weatherSection = await buildWeatherOutlook(
      settings.weatherGridPoint as string,
      settings.weatherLocation as string,
      now
    );
    sections.push(weatherSection);
  }

  // This week's events from sources
  const eventSources = parseJsonSetting<EventSource[]>(settings.eventSources as string, []);
  if (eventSources.length > 0) {
    sections.push(buildEventSourcesSection(eventSources));
  }

  // Community-submitted events
  if (settings.enableUserEvents) {
    const userEventsSection = await buildWeeklyUserEventsSection(context, now);
    if (userEventsSection) {
      sections.push(userEventsSection);
    }
  }

  // How to submit events
  if (settings.enableUserEvents) {
    sections.push(buildSubmitEventInfo());
  }

  // Community links section
  const communityLinks = parseJsonSetting<CommunityLink[]>(settings.communityLinks as string, []);
  const validLinks = communityLinks.filter(link => link.url && link.url.trim() !== '');
  if (validLinks.length > 0) {
    sections.push(buildCommunityLinksSection(validLinks));
  }

  // Footer
  const botName = settings.botName as string || 'Community Hub Bot';
  sections.push(`---\n*Posted by ${botName}*`);

  return sections.join('\n\n');
}

/**
 * Build weather outlook section
 */
async function buildWeatherOutlook(gridPoint: string, location: string, date: Date): Promise<string> {
  const lines: string[] = [`## 🌤️ Weather Outlook - ${location}`];

  try {
    const forecast = await getWeatherForecast(gridPoint);
    if (forecast) {
      lines.push(formatWeatherForPost(forecast));
      lines.push(`\n*Extended forecast: [weather.gov](https://forecast.weather.gov)*`);
    } else {
      lines.push('*Weather data temporarily unavailable*');
    }
  } catch (error) {
    console.error('Failed to fetch weather:', error);
    lines.push('*Weather data temporarily unavailable*');
  }

  lines.push(`\n${formatMoonPhase(date)}`);

  return lines.join('\n');
}

/**
 * Build event sources section
 */
function buildEventSourcesSection(sources: EventSource[]): string {
  const lines: string[] = ['## 🎭 Find Events This Week'];

  sources.forEach(source => {
    lines.push(`• ${source.icon} [${source.name}](${source.url})`);
  });

  return lines.join('\n');
}

/**
 * Build user-submitted events for the week
 */
async function buildWeeklyUserEventsSection(context: JobContext, now: Date): Promise<string | null> {
  try {
    const eventsJson = await context.redis.get('user_events');
    if (!eventsJson) return null;

    const events = JSON.parse(eventsJson);
    const weekStart = getWeekStart(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Filter to approved events happening this week
    const weekEvents = Object.values(events).filter((e: any) => {
      if (!e.approved) return false;
      const eventDate = new Date(e.dateStart);
      return eventDate >= weekStart && eventDate < weekEnd;
    });

    if (weekEvents.length === 0) return null;

    const lines: string[] = ['## 📅 Community Events This Week'];

    // Sort by date
    (weekEvents as any[])
      .sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime())
      .forEach(event => {
        const dateStr = new Date(event.dateStart).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        lines.push(`• **${dateStr}** - [${event.title}](${event.url})`);
        if (event.description) {
          lines.push(`  *${event.description}*`);
        }
      });

    return lines.join('\n');
  } catch (error) {
    console.error('Failed to load user events:', error);
    return null;
  }
}

/**
 * Build info about submitting events
 */
function buildSubmitEventInfo(): string {
  return `## 📝 Submit an Event

Have an event to share? Look for the **Community Hub** post pinned to the subreddit and use the "Submit Event" button to add your event to the calendar.

Events must link to trusted sites (Eventbrite, Meetup, Facebook Events, government sites, etc.)`;
}

/**
 * Build community links section
 */
function buildCommunityLinksSection(links: CommunityLink[]): string {
  const lines: string[] = ['## 🔗 Community Links'];

  links.forEach(link => {
    lines.push(`• ${link.icon} [${link.name}](${link.url})`);
  });

  return lines.join('\n');
}

/**
 * Safely parse JSON settings
 */
function parseJsonSetting<T>(json: string | undefined, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json);
  } catch {
    return defaultValue;
  }
}
