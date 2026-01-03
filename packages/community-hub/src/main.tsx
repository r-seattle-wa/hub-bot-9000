import { Devvit } from '@devvit/public-api';
import { appSettings } from './config/settings.js';
import { CommunityPost } from './components/CommunityPost.js';
import { EventFeed } from './components/EventFeed.js';
import { handleDailyPost } from './scheduler/dailyPost.js';
import { handleWeeklyPost } from './scheduler/weeklyPost.js';
import {
  handleInstallUpgrade,
  handleCleanupEvents,
  handleFetchEvents,
  JOB_DAILY_POST,
  JOB_WEEKLY_POST,
  JOB_CLEANUP_EVENTS,
  JOB_FETCH_EVENTS,
} from './scheduler/installHandlers.js';
import { EventService } from './services/eventService.js';

// Register app settings
Devvit.addSettings(appSettings);

// ============================================
// Scheduler Jobs
// ============================================

Devvit.addSchedulerJob({
  name: JOB_DAILY_POST,
  onRun: handleDailyPost,
});

Devvit.addSchedulerJob({
  name: JOB_WEEKLY_POST,
  onRun: handleWeeklyPost,
});

Devvit.addSchedulerJob({
  name: JOB_CLEANUP_EVENTS,
  onRun: handleCleanupEvents,
});

Devvit.addSchedulerJob({
  name: JOB_FETCH_EVENTS,
  onRun: handleFetchEvents,
});

// ============================================
// Triggers
// ============================================

Devvit.addTrigger({
  events: ['AppInstall', 'AppUpgrade'],
  onEvent: handleInstallUpgrade,
});

// ============================================
// Custom Post Type
// ============================================

Devvit.addCustomPostType({
  name: 'Community Hub',
  height: 'tall',
  render: CommunityPost,
});

Devvit.addCustomPostType({
  name: 'Hub Bot Events',
  description: 'Live feed of hub-bot activity across all bots',
  height: 'tall',
  render: EventFeed,
});

// ============================================
// Menu Items
// ============================================

// Create Community Hub Post (subreddit menu)
Devvit.addMenuItem({
  label: 'Create Community Hub',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    const settings = await context.settings.getAll();
    const headerTitle = (settings.headerTitle as string) || 'Community Hub';
    const subredditName = await context.reddit.getCurrentSubredditName();

    const post = await context.reddit.submitPost({
      title: `${headerTitle} - ${subredditName}`,
      subredditName: subredditName,
      preview: (
        <vstack padding="large" alignment="center middle" backgroundColor="#0e0e1a" height="100%">
          <text size="xlarge" weight="bold" color="white">Loading Community Hub...</text>
          <spacer size="medium" />
          <text size="medium" color="#888888">This may take a moment</text>
        </vstack>
      ),
    });

    context.ui.showToast({ text: 'Community Hub post created!', appearance: 'success' });
    context.ui.navigateTo(post);
  },
});

// Create Hub Bot Events Widget (subreddit menu)
Devvit.addMenuItem({
  label: 'Create Hub Bot Events Widget',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    const subreddit = await context.reddit.getCurrentSubreddit();
    const post = await context.reddit.submitPost({
      subredditName: subreddit.name,
      title: 'Hub Bot Events Feed',
      preview: (
        <vstack padding="medium" alignment="center middle" grow>
          <text weight="bold" size="large">Hub Bot Events</text>
          <text color="neutral-content-weak">Loading...</text>
        </vstack>
      ),
    });
    context.ui.showToast({ text: 'Hub Bot Events widget created!', appearance: 'success' });
    context.ui.navigateTo(post);
  },
});

// Manual Daily Post (subreddit menu)
Devvit.addMenuItem({
  label: 'Post Daily Thread Now',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    context.ui.showToast({ text: 'Creating daily thread...', appearance: 'neutral' });
    try {
      await handleDailyPost({} as any, context);
      context.ui.showToast({ text: 'Daily thread posted!', appearance: 'success' });
    } catch (error) {
      console.error('Failed to create daily post:', error);
      context.ui.showToast({ text: 'Failed to create daily thread', appearance: 'neutral' });
    }
  },
});

// Post-level menu item (easier to find - appears on any post's three-dot menu)
Devvit.addMenuItem({
  label: '[Hub Bot] Create Daily Thread',
  location: 'post',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    context.ui.showToast({ text: 'Creating daily thread...', appearance: 'neutral' });
    try {
      await handleDailyPost({} as any, context);
      context.ui.showToast({ text: 'Daily thread posted!', appearance: 'success' });
    } catch (error) {
      console.error('Failed to create daily post:', error);
      context.ui.showToast({ text: 'Failed to create daily thread', appearance: 'neutral' });
    }
  },
});

// Manual Weekly Post (subreddit menu)
Devvit.addMenuItem({
  label: 'Post Weekly Thread Now',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    context.ui.showToast({ text: 'Creating weekly thread...', appearance: 'neutral' });
    try {
      await handleWeeklyPost({} as any, context);
      context.ui.showToast({ text: 'Weekly thread posted!', appearance: 'success' });
    } catch (error) {
      console.error('Failed to create weekly post:', error);
      context.ui.showToast({ text: 'Failed to create weekly thread', appearance: 'neutral' });
    }
  },
});

// ============================================
// Mod Tools - Event Management
// ============================================

// View pending events (subreddit menu)
Devvit.addMenuItem({
  label: 'Review Pending Events',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    const pendingEvents = await EventService.getPendingEvents(context);

    if (pendingEvents.length === 0) {
      context.ui.showToast({ text: 'No pending events to review', appearance: 'neutral' });
      return;
    }

    // Show the first pending event for review
    const event = pendingEvents[0];
    const form = Devvit.createForm(
      {
        title: `Review Event: ${event.title}`,
        description: `Submitted by: u/${event.submittedBy}\nDate: ${event.dateStart}\nURL: ${event.url}\n\n${event.description || 'No description'}`,
        fields: [
          {
            name: 'action',
            label: 'Action',
            type: 'select',
            options: [
              { label: 'Approve', value: 'approve' },
              { label: 'Reject', value: 'reject' },
              { label: 'Skip', value: 'skip' },
            ],
            required: true,
          },
        ],
        acceptLabel: 'Submit',
        cancelLabel: 'Cancel',
      },
      async (formData) => {
        const action = formData.values.action?.[0];
        if (action === 'approve') {
          await EventService.approveEvent(event.id, context);
          context.ui.showToast({ text: `Event "${event.title}" approved!`, appearance: 'success' });
        } else if (action === 'reject') {
          await EventService.deleteEvent(event.id, context);
          context.ui.showToast({ text: `Event "${event.title}" rejected`, appearance: 'neutral' });
        }

        // Show remaining count
        const remaining = pendingEvents.length - 1;
        if (remaining > 0) {
          context.ui.showToast({ text: `${remaining} more events pending review`, appearance: 'neutral' });
        }
      }
    );

    context.ui.showForm(form);
  },
});

// ============================================
// Configuration
// ============================================

Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true,
});

export default Devvit;
