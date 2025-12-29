// Response templates for farewell-hero
// 5 sarcasm levels: POLITE, NEUTRAL, SNARKY, ROAST, FREAKOUT

import { UserSubredditStats, formatStatsTable } from './stats.js';
import { getStatsFooter, SarcasmLevel, UserTone, ToneClassificationResult } from '@hub-bot/common';
import { PoliticalComplaintResult } from './detector.js';

interface ResponseSet {
  lurker: string[];
  powerUser: string[];
  notableContributor: string[];
  standard: string[];
  repeat: string[];
}

const RESPONSES: Record<SarcasmLevel, ResponseSet> = {
  [SarcasmLevel.POLITE]: {
    lurker: ['Thank you for being part of our community. We wish you all the best.'],
    powerUser: ['Thank you for your {totalActivity} contributions over {timespan}. You have been valuable.'],
    notableContributor: ['You have been one of our top contributors. Thank you for making this community better.'],
    standard: ['Thank you for being part of r/{subreddit}. Best wishes.'],
    repeat: ['Welcome back! Hope to see you again soon!'],
  },
  [SarcasmLevel.NEUTRAL]: {
    lurker: ['Activity summary: {totalActivity} contributions over {timespan}.'],
    powerUser: ['Stats: {totalPosts} posts, {totalComments} comments over {timespan}.'],
    notableContributor: ['You appeared in our top contributor lists. Notable engagement.'],
    standard: ['Your r/{subreddit} activity summary for the record.'],
    repeat: ['Departure announcement #{count}. Stats available.'],
  },
  [SarcasmLevel.SNARKY]: {
    lurker: ['We will definitely notice the absence of your *checks notes* {totalActivity} contributions.'],
    powerUser: ['Credit where due: {totalActivity} contributions is actually respectable.'],
    notableContributor: ['A top contributor is leaving? Let me update the wiki... eventually.'],
    standard: ['Another dramatic exit. Here are your stats, for what it is worth.'],
    repeat: ['Back for round #{count}? The revolving door was getting lonely.'],
  },
  [SarcasmLevel.ROAST]: {
    lurker: ['Your {totalActivity} contributions will be missed. By literally no one.'],
    powerUser: ['The person who posted {totalActivity} times finally ran out of things to say.'],
    notableContributor: ['Top contributor leaving? Updating wiki under Notable Departures (Dramatic).'],
    standard: ['The Grand Departure. Let me pull up your receipt.'],
    repeat: ['Round #{count}! At this point you are commuting, not leaving.'],
  },
  [SarcasmLevel.FREAKOUT]: {
    lurker: ['OH NO! NOT SOMEONE WITH {totalActivity} CONTRIBUTIONS! WHO WILL PROVIDE NOTHING?!'],
    powerUser: ['DEFCON 1! We are losing {totalActivity} contributions! THIS IS NOT A DRILL!'],
    notableContributor: ['CODE RED! TOP CONTRIBUTOR LEAVING! THE STATISTICS! THE PIE CHARTS!'],
    standard: ['HOLD THE PRESSES! Someone is leaving! FULL STATISTICAL BREAKDOWN!'],
    repeat: ['OH NO! Farewell #{count}! This is now a SITCOM!'],
  },
};

export function determineSarcasmLevel(
  detectedTone: UserTone,
  defaultLevel: SarcasmLevel,
  matchToneToUser: boolean
): SarcasmLevel {
  if (!matchToneToUser) return defaultLevel;
  switch (detectedTone) {
    case UserTone.POLITE: return SarcasmLevel.POLITE;
    case UserTone.NEUTRAL: return defaultLevel;
    case UserTone.FRUSTRATED: return higherSarcasm(defaultLevel, SarcasmLevel.SNARKY);
    case UserTone.HOSTILE: return higherSarcasm(defaultLevel, SarcasmLevel.ROAST);
    case UserTone.DRAMATIC: return SarcasmLevel.FREAKOUT;
    default: return defaultLevel;
  }
}

function higherSarcasm(a: SarcasmLevel, b: SarcasmLevel): SarcasmLevel {
  const order = [SarcasmLevel.POLITE, SarcasmLevel.NEUTRAL, SarcasmLevel.SNARKY, SarcasmLevel.ROAST, SarcasmLevel.FREAKOUT];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatTimespan(days: number | null): string {
  if (!days || days < 1) return 'today';
  if (days === 1) return '1 day';
  if (days < 30) return days + ' days';
  if (days < 365) return Math.floor(days / 30) + ' months';
  return Math.floor(days / 365) + ' years';
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateFarewellResponse(
  stats: UserSubredditStats,
  sarcasmLevel: SarcasmLevel,
  toneResult?: ToneClassificationResult,
  repeatCount?: number
): string {
  const totalActivity = stats.totalPosts + stats.totalComments;
  const timespan = formatTimespan(stats.daysSinceFirstActivity);
  const responses = RESPONSES[sarcasmLevel];
  let intro: string;

  if (repeatCount && repeatCount > 1) {
    intro = pickRandom(responses.repeat).replace('{count}', String(repeatCount)).replace('{ordinal}', getOrdinal(repeatCount));
  } else if (stats.isLurker) {
    intro = pickRandom(responses.lurker).replace('{totalActivity}', String(totalActivity)).replace('{timespan}', timespan);
  } else if (stats.isNotableContributor) {
    intro = pickRandom(responses.notableContributor);
  } else if (stats.isPowerUser) {
    intro = pickRandom(responses.powerUser).replace('{totalPosts}', String(stats.totalPosts)).replace('{totalComments}', String(stats.totalComments)).replace('{totalActivity}', String(totalActivity)).replace('{timespan}', timespan);
  } else {
    intro = pickRandom(responses.standard).replace('{subreddit}', stats.subreddit);
  }

  const statsTable = formatStatsTable(stats);
  let footer = getStatsFooter();

  if (toneResult) {
    footer += '\n\n---\n*Tone: ' + toneResult.tone.toUpperCase() + ' | Response: ' + sarcasmLevel.toUpperCase() + '*';
  }

  return '**Farewell Statistics for u/' + stats.username + '**\n\n' + intro + '\n\n' + statsTable + footer;
}

/**
 * Responses for political/echo chamber complaints
 * References wiki demographic/political surveys
 */
const POLITICAL_COMPLAINT_RESPONSES: Record<SarcasmLevel, { rightLeaning: string[]; leftLeaning: string[]; general: string[] }> = {
  [SarcasmLevel.POLITE]: {
    rightLeaning: [
      'We understand the concern. Our [demographic surveys](/r/{subreddit}/wiki/surveys) show the community is actually quite politically diverse.',
      'Thanks for sharing your perspective. You might find our [annual survey results](/r/{subreddit}/wiki/surveys) interesting - the political breakdown may surprise you.',
    ],
    leftLeaning: [
      'We appreciate the feedback. Our [demographic surveys](/r/{subreddit}/wiki/surveys) actually show diverse political viewpoints.',
      'Thanks for your input. Our [survey data](/r/{subreddit}/wiki/surveys) indicates a more balanced community than you might expect.',
    ],
    general: [
      'Echo chamber concerns are valid. We track this via [demographic surveys](/r/{subreddit}/wiki/surveys) - you might find the results informative.',
    ],
  },
  [SarcasmLevel.NEUTRAL]: {
    rightLeaning: [
      'Political composition per [survey data](/r/{subreddit}/wiki/surveys): Not what you might expect.',
      'Survey results available at [/wiki/surveys](/r/{subreddit}/wiki/surveys). The data may challenge assumptions.',
    ],
    leftLeaning: [
      'Survey data at [/wiki/surveys](/r/{subreddit}/wiki/surveys) shows different political breakdown than perceived.',
      'Demographic info: [/wiki/surveys](/r/{subreddit}/wiki/surveys). Reality differs from perception.',
    ],
    general: [
      'See [demographic surveys](/r/{subreddit}/wiki/surveys) for actual community composition data.',
    ],
  },
  [SarcasmLevel.SNARKY]: {
    rightLeaning: [
      'Trump subreddit - interesting theory. Our [actual survey data](/r/{subreddit}/wiki/surveys) would like a word.',
      'Ah yes, the famous Trump echo chamber that... *checks surveys* ...voted majority Democrat. [Data here](/r/{subreddit}/wiki/surveys).',
    ],
    leftLeaning: [
      'Liberal echo chamber claims vs [actual demographic data](/r/{subreddit}/wiki/surveys). Lets see who wins.',
      'The leftist hivemind narrative meets [survey results](/r/{subreddit}/wiki/surveys). Plot twist incoming.',
    ],
    general: [
      'Echo chamber complaints are fun. Know whats more fun? [Actual data](/r/{subreddit}/wiki/surveys).',
    ],
  },
  [SarcasmLevel.ROAST]: {
    rightLeaning: [
      'This is a Trump subreddit! - Source: Trust me bro. Counter-source: [Actual surveys](/r/{subreddit}/wiki/surveys).',
      'The Trump Subreddit that our [demographic surveys](/r/{subreddit}/wiki/surveys) forgot to inform. Awkward.',
    ],
    leftLeaning: [
      'Liberal echo chamber! screams person who never checked [the surveys](/r/{subreddit}/wiki/surveys).',
      'Another leftist hivemind take from someone allergic to [actual data](/r/{subreddit}/wiki/surveys).',
    ],
    general: [
      'Bold echo chamber claim from someone who clearly hasnt seen [our surveys](/r/{subreddit}/wiki/surveys).',
    ],
  },
  [SarcasmLevel.FREAKOUT]: {
    rightLeaning: [
      'BREAKING: Person discovers subreddit is MAGA! Surveys say... *checks notes* ...THATS DEMONSTRABLY FALSE! [DATA](/r/{subreddit}/wiki/surveys)!',
      'ALERT! SOMEONE THINKS WERE A TRUMP SUB! Quick, someone show them [THE SURVEYS](/r/{subreddit}/wiki/surveys)!',
    ],
    leftLeaning: [
      'OH NO! WEVE BEEN EXPOSED AS LEFTISTS! Except... [THE DATA SAYS OTHERWISE](/r/{subreddit}/wiki/surveys)! THE HORROR!',
      'CODE RED! LIBERAL ECHO CHAMBER DETECTED! Deploy [DEMOGRAPHIC SURVEYS](/r/{subreddit}/wiki/surveys)!',
    ],
    general: [
      'ECHO CHAMBER ALERT! ECHO CHAMBER ALERT! Deploying [SURVEY DATA](/r/{subreddit}/wiki/surveys) COUNTERMEASURES!',
    ],
  },
};

/**
 * Generate response for political/echo chamber complaints
 */
export function generatePoliticalComplaintResponse(
  subreddit: string,
  complaint: PoliticalComplaintResult,
  sarcasmLevel: SarcasmLevel
): string {
  const responses = POLITICAL_COMPLAINT_RESPONSES[sarcasmLevel];
  let templateArray: string[];

  switch (complaint.complaintType) {
    case 'right-leaning':
      templateArray = responses.rightLeaning;
      break;
    case 'left-leaning':
      templateArray = responses.leftLeaning;
      break;
    default:
      templateArray = responses.general;
  }

  const template = pickRandom(templateArray);
  return template.replace(/\{subreddit\}/g, subreddit);
}
