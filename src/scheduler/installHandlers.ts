import { TriggerContext } from '@devvit/public-api';
import { parseTime } from '../utils/dateUtils.js';

// Job names
export const JOB_DAILY_POST = 'dailyPost';
export const JOB_WEEKLY_POST = 'weeklyPost';
export const JOB_CLEANUP_EVENTS = 'cleanupEvents';

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

    const message = `# Welcome to Community Hub Bot! 🎉

Thank you for installing Community Hub Bot on r/${subredditName}!

## Getting Started

1. **Configure your settings** in the app settings panel:
   - Set your location for weather forecasts
   - Add your event sources (local calendars, venues)
   - Configure your community links (Discord, wiki, rules)
   - Set your preferred posting times

2. **Daily & Weekly Posts** will automatically be created based on your schedule settings.

3. **Interactive Community Hub** - You can also create an interactive pinned post:
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

- View the [documentation on GitHub](https://github.com/r-seattle-wa/community-hub-bot)
- Report issues on [GitHub Issues](https://github.com/r-seattle-wa/community-hub-bot/issues)

Happy community building! 🚀`;

    await context.reddit.modMail.createModInboxConversation({
      subredditId: context.subredditId,
      subject: 'Welcome to Community Hub Bot!',
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
