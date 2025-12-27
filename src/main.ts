import { Devvit } from '@devvit/public-api';
import { appSettings } from './config/settings.js';

// Register app settings
Devvit.addSettings(appSettings);

// TODO: Add scheduler jobs for daily/weekly posts
// Devvit.addSchedulerJob({
//   name: 'dailyPost',
//   onRun: handleDailyPost,
// });

// TODO: Add install/upgrade triggers to schedule jobs
// Devvit.addTrigger({
//   events: ['AppInstall', 'AppUpgrade'],
//   onEvent: handleInstallUpgrade,
// });

// TODO: Add custom post type for interactive community hub
// Devvit.addCustomPostType({
//   name: 'Community Hub',
//   height: 'tall',
//   render: CommunityPost,
// });

// TODO: Add menu items for manual post creation
// Devvit.addMenuItem({
//   label: 'Create Community Hub Post',
//   location: 'subreddit',
//   onPress: handleCreatePost,
// });

// Configure Devvit capabilities
Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true, // For NWS API calls
});

export default Devvit;
