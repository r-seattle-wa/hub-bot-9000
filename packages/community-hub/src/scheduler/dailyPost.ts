import { JobContext } from '@devvit/public-api';
import { getWeatherForecast, formatWeatherForPost } from '../services/weatherService.js';
import { formatMoonPhase } from '../services/moonService.js';
import { formatDate, getDayOfWeek } from '../utils/dateUtils.js';
import { EventSource, CommunityLink } from '../types/index.js';

/**
 * Generate and post the daily community thread
 */
export async function handleDailyPost(_: unknown, context: JobContext): Promise<void> {
  console.log('Running daily post job...');

  try {
    const settings = await context.settings.getAll();

    // Check if daily posts are enabled
    if (!settings.enableDailyPost) {
      console.log('Daily posts are disabled, skipping.');
      return;
    }

    const subredditName = await context.reddit.getCurrentSubredditName();
    const now = new Date();

    // Build post title
    const title = buildPostTitle(
      settings.postTitleDaily as string || '{location} Daily Community Thread - {dayOfWeek}, {date}',
      settings.weatherLocation as string || 'Community',
      now
    );

    // Build post body
    const body = await buildDailyPostBody(settings, context);

    // Create the post
    const post = await context.reddit.submitPost({
      subredditName,
      title,
      text: body,
    });

    console.log(`Daily post created: ${post.id}`);

    // Optionally sticky the post
    // await post.sticky();

  } catch (error) {
    console.error('Failed to create daily post:', error);
  }
}

/**
 * Build the post title from template
 */
function buildPostTitle(template: string, location: string, date: Date): string {
  return template
    .replace('{location}', location)
    .replace('{date}', formatDate(date, 'short'))
    .replace('{dayOfWeek}', getDayOfWeek(date));
}

/**
 * Build the daily post body content
 */
async function buildDailyPostBody(settings: Record<string, unknown>, context: JobContext): Promise<string> {
  const sections: string[] = [];
  const now = new Date();

  // Header
  sections.push(`Welcome to today's open community thread!\n`);

  // Weather section
  if (settings.enableWeather) {
    const weatherSection = await buildWeatherSection(
      settings.weatherGridPoint as string,
      settings.weatherLocation as string,
      now
    );
    sections.push(weatherSection);
  }

  // Event sources section
  const eventSources = parseJsonSetting<EventSource[]>(settings.eventSources as string, []);
  if (eventSources.length > 0) {
    sections.push(buildEventSourcesSection(eventSources));
  }

  // User events section (if enabled)
  if (settings.enableUserEvents) {
    const userEventsSection = await buildUserEventsSection(context);
    if (userEventsSection) {
      sections.push(userEventsSection);
    }
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
 * Build weather section
 */
async function buildWeatherSection(gridPoint: string, location: string, date: Date): Promise<string> {
  const lines: string[] = [`## 🌤️ Weather - ${location}`];

  try {
    const forecast = await getWeatherForecast(gridPoint);
    if (forecast) {
      lines.push(formatWeatherForPost(forecast));
    } else {
      lines.push('*Weather data temporarily unavailable*');
    }
  } catch (error) {
    console.error('Failed to fetch weather:', error);
    lines.push('*Weather data temporarily unavailable*');
  }

  // Add moon phase
  lines.push(`\n${formatMoonPhase(date)}`);

  return lines.join('\n');
}

/**
 * Build event sources section
 */
function buildEventSourcesSection(sources: EventSource[]): string {
  const lines: string[] = ['## 🎭 Find Events'];

  sources.forEach(source => {
    lines.push(`• ${source.icon} [${source.name}](${source.url})`);
  });

  return lines.join('\n');
}

/**
 * Build user-submitted events section
 */
async function buildUserEventsSection(context: JobContext): Promise<string | null> {
  try {
    const eventsJson = await context.redis.get('user_events');
    if (!eventsJson) return null;

    const events = JSON.parse(eventsJson);
    const approvedEvents = Object.values(events).filter((e: any) => e.approved);

    if (approvedEvents.length === 0) return null;

    const lines: string[] = ['## 📅 Community Events'];

    (approvedEvents as any[]).slice(0, 10).forEach(event => {
      const dateStr = new Date(event.dateStart).toLocaleDateString('en-US', {
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
