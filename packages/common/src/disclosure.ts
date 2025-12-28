// Bot disclosure footers - Reddit compliance

const APP_URL = 'https://developers.reddit.com/apps/hub-bot-9000';

/**
 * Standard bot footer for user-reply comments (includes opt-out)
 */
export function getBotFooter(): string {
  return `\n\n---\n^(🤖 [hub-bot-9000](${APP_URL}) · opt-out: block me)`;
}

/**
 * Footer for sticky mod announcements (no opt-out needed)
 */
export function getModFooter(): string {
  return `\n\n---\n^(🤖 [hub-bot-9000](${APP_URL}))`;
}

/**
 * Haiku-specific footer (cute!)
 */
export function getHaikuFooter(): string {
  return `\n\n---\n^(✨ beep boop, a haiku · [about](${APP_URL}))`;
}

/**
 * Stats footer for farewell-statistician
 */
export function getStatsFooter(): string {
  return `\n\n---\n^(📊 public stats only · [hub-bot-9000](${APP_URL}))`;
}
