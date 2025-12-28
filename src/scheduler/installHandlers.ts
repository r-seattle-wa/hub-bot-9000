import { TriggerContext } from '@devvit/public-api';
import { parseTime } from '../utils/dateUtils.js';

// Job names
export const JOB_DAILY_POST = 'dailyPost';
export const JOB_WEEKLY_POST = 'weeklyPost';
export const JOB_CLEANUP_EVENTS = 'cleanupEvents';
export const JOB_FETCH_EVENTS = 'fetchEvents';

/**
 * Handle app install/upgrade events
 * Schedules all recurring jobs based on settings
 */
export async function handleInstallUpgrade(_: unknown, context: TriggerContext): Promise<void> {
  console.log('App installed or upgraded. Scheduling jobs...');

  try {
    // Cancel any existing jobs to avoid duplicates
    const existingJobs = await context.scheduler.listJobs();
    await Promise.all(existingJobs.map(job => context.scheduler.cancelJob(job.id)));
    console.log(`Cancelled ${existingJobs.length} existing jobs.`);

    // Get settings
    const settings = await context.settings.getAll();

    // Schedule daily post
    if (settings.enableDailyPost) {
      const dailyTime = settings.dailyPostTime as string || '15:00';
      const { hours, minutes } = parseTime(dailyTime);

      await context.scheduler.runJob({
        name: JOB_DAILY_POST,
        cron: `${minutes} ${hours} * * *`, // Every day at specified time
      });
      console.log(`Scheduled daily post at ${dailyTime} UTC`);
    }

    // Schedule weekly post
    if (settings.enableWeeklyPost) {
      const weeklyTime = settings.weeklyPostTime as string || '15:00';
      const weeklyDay = settings.weeklyPostDay as string[] || ['1'];
      const dayOfWeek = weeklyDay[0] || '1'; // Default to Monday
      const { hours, minutes } = parseTime(weeklyTime);

      await context.scheduler.runJob({
        name: JOB_WEEKLY_POST,
        cron: `${minutes} ${hours} * * ${dayOfWeek}`, // Weekly on specified day/time
      });
      console.log(`Scheduled weekly post on day ${dayOfWeek} at ${weeklyTime} UTC`);
    }

    // Schedule event cleanup (daily at 3 AM UTC)
    await context.scheduler.runJob({
      name: JOB_CLEANUP_EVENTS,
      cron: '0 3 * * *',
    });
    console.log('Scheduled event cleanup at 03:00 UTC');

    // Schedule event scraper fetch (every 12 hours at 6 AM and 6 PM UTC)
    if (settings.scraperUrl) {
      await context.scheduler.runJob({
        name: JOB_FETCH_EVENTS,
        cron: '0 6,18 * * *',
      });
      console.log('Scheduled event scraper fetch at 06:00 and 18:00 UTC');
    }

    // Send welcome modmail on first install
    await sendWelcomeMessage(context);

  } catch (error) {
    console.error('Failed to schedule jobs:', error);
  }
}

/**
 * Send welcome modmail to the subreddit
 */
async function sendWelcomeMessage(context: TriggerContext): Promise<void> {
  try {
    const subredditName = context.subredditName ?? await context.reddit.getCurrentSubredditName();

    // Check if we've already sent a welcome message
    const welcomeSent = await context.redis.get('welcome_sent');
    if (welcomeSent) {
      return;
    }

    const message = `# Welcome to Hub Bot 9000! 🤖

Thank you for installing Hub Bot 9000 on r/${subredditName}!

## Getting Started

1. **[Configure your settings](https://developers.reddit.com/r/${subredditName}/apps/hub-bot-9000)** - Click this link to set up:
   - Your location for weather forecasts
   - Event sources (local calendars, venues)
   - Community links (Discord, wiki, rules)
   - Posting schedule and times

2. **Daily & Weekly Posts** will automatically be created based on your schedule settings.

3. **Interactive Community Hub** - Create an interactive pinned post:
   - Go to your subreddit
   - Click the three-dot menu → "Create Community Hub"
   - This creates an interactive post where users can view events and submit their own

## Features

- 🌤️ **Weather Forecasts** - Automatic NWS weather integration
- 🌙 **Moon Phases** - Current moon phase display
- 🎭 **Event Sources** - Links to your configured event calendars
- 📅 **User Events** - Community members can submit events
- 🔗 **Community Links** - Quick access to Discord, wiki, etc.

## Need Help?

- [App Settings](https://developers.reddit.com/r/${subredditName}/apps/hub-bot-9000)
- [Documentation on GitHub](https://github.com/r-seattle-wa/hub-bot-9000)
- [Report Issues](https://github.com/r-seattle-wa/hub-bot-9000/issues)

Happy community building! 🚀`;

    await context.reddit.modMail.createModInboxConversation({
      subredditId: context.subredditId,
      subject: 'Welcome to Hub Bot 9000!',
      bodyMarkdown: message,
    });

    // Mark welcome as sent
    await context.redis.set('welcome_sent', 'true');
    console.log('Welcome message sent to modmail.');

  } catch (error) {
    console.error('Failed to send welcome message:', error);
  }
}

/**
 * Handle event cleanup job
 */
export async function handleCleanupEvents(_: unknown, context: TriggerContext): Promise<void> {
  console.log('Running event cleanup...');

  try {
    // Import dynamically to avoid circular deps
    const { EventService } = await import('../services/eventService.js');
    const removedCount = await EventService.cleanupExpiredEvents(context as any);
    console.log(`Cleaned up ${removedCount} expired events.`);
  } catch (error) {
    console.error('Failed to cleanup events:', error);
  }
}

/**
 * Handle fetch events from Cloud Run scraper
 */
export async function handleFetchEvents(_: unknown, context: TriggerContext): Promise<void> {
  console.log('Fetching events from scraper service...');

  try {
    const settings = await context.settings.getAll();
    const scraperUrl = settings.scraperUrl as string;

    if (!scraperUrl) {
      console.log('No scraper URL configured, skipping fetch.');
      return;
    }

    // Fetch from Cloud Run
    const response = await fetch(`${scraperUrl}/events?days=3`, {
      headers: { 'User-Agent': 'HubBot9000/1.0' },
    });

    if (!response.ok) {
      throw new Error(`Scraper returned ${response.status}`);
    }

    const data = await response.json();
    const events = data.events || [];

    // Save to Redis
    const { EventService } = await import('../services/eventService.js');
    await EventService.saveScrapedEvents(events, context as any);

    console.log(`Fetched and cached ${events.length} events from scraper.`);
  } catch (error) {
    console.error('Failed to fetch events from scraper:', error);
  }
}
