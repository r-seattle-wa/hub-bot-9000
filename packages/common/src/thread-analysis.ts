// Thread analysis for crosslink posts
// Automatically extracts hater data and updates leaderboard with sticky comment

import { TriggerContext, JobContext } from '@devvit/public-api';
import { rateLimitedFetch } from './http.js';
import { LeaderboardData, ACHIEVEMENT_XP } from './leaderboard.js';
import { checkAchievements, getHighestNewAchievement, TIER_EMOJIS, Achievement } from './achievements.js';
import { detectTalkingPoints } from './meme-detector.js';

type AppContext = TriggerContext | JobContext;

// Wiki page for storing thread analyses
export const THREAD_ANALYSES_WIKI = 'hub-bot-9000/thread-analyses';

/**
 * Stored analysis entry in wiki
 */
export interface StoredAnalysis {
  analyzedAt: number;
  postId: string;
  postTitle: string;
  postAuthor: string;
  postScore: number;
  sourceSubreddit: string;
  targetSubreddit: string;
  commentCount: number;
  targetMentions: number;
  hatersFound: number;
  haters: Array<{
    username: string;
    points: number;
    quote: string;
    quoteScore: number;
    quoteLink: string;
    achievement?: string;
  }>;
  achievements: Array<{
    user: string;
    achievementName: string;
    tier: string;
  }>;
}

/**
 * Wiki data structure for thread analyses
 */
export interface ThreadAnalysesData {
  updatedAt: number;
  totalAnalyses: number;
  analyses: StoredAnalysis[];
}

interface RedditComment {
  author: string;
  body: string;
  score: number;
  permalink: string;
}

interface HaterData {
  username: string;
  points: number;
  quote: string;
  quoteScore: number;
  quoteLink: string;
  newAchievement?: Achievement;
}

interface ThreadAnalysis {
  postId: string;
  postTitle: string;
  postAuthor: string;
  postScore: number;
  subreddit: string;
  commentCount: number;
  targetMentions: number;
  haters: HaterData[];
}

/**
 * Fetch and flatten all comments from a Reddit thread
 */
async function fetchThreadComments(postId: string, subreddit: string): Promise<{
  post: { title: string; author: string; score: number };
  comments: RedditComment[];
}> {
  const url = `https://www.reddit.com/r/${subreddit}/comments/${postId}.json?limit=500&depth=10`;
  const result = await rateLimitedFetch<string>(url, {
    headers: { 'User-Agent': 'HubBot9000/1.0 (by /r/SeattleWA)' },
  });

  if (!result.ok || !result.data) {
    return { post: { title: '', author: '', score: 0 }, comments: [] };
  }

  const data = JSON.parse(result.data);
  const postData = data[0]?.data?.children?.[0]?.data || {};
  const commentsData = data[1]?.data?.children || [];
  const comments: RedditComment[] = [];

  function extractComments(children: any[]) {
    for (const c of children) {
      if (c.kind !== 't1') continue;
      const d = c.data;
      if (d.body && d.body !== '[deleted]' && d.body !== '[removed]') {
        comments.push({
          author: d.author || '[deleted]',
          body: d.body,
          score: d.score || 0,
          permalink: `https://reddit.com${d.permalink}`,
        });
      }
      if (d.replies?.data?.children) extractComments(d.replies.data.children);
    }
  }
  extractComments(commentsData);

  return {
    post: { title: postData.title || '', author: postData.author || '', score: postData.score || 0 },
    comments,
  };
}

/**
 * Analyze a crosslink thread and extract hater data
 */
export async function analyzeThread(
  postId: string,
  sourceSubreddit: string,
  targetSubreddit: string
): Promise<ThreadAnalysis | null> {
  const { post, comments } = await fetchThreadComments(postId, sourceSubreddit);
  if (!post.title || comments.length === 0) return null;

  const targetLower = targetSubreddit.toLowerCase();
  const targetMentions = comments.filter(c =>
    c.body.toLowerCase().includes(targetLower) || c.body.toLowerCase().includes(`r/${targetLower}`)
  ).length;

  // Group by author, find best quote
  const authorComments = new Map<string, RedditComment[]>();
  for (const c of comments) {
    if (c.author === '[deleted]' || c.author === 'AutoModerator') continue;
    const arr = authorComments.get(c.author) || [];
    arr.push(c);
    authorComments.set(c.author, arr);
  }

  const haters: HaterData[] = [];
  for (const [author, cmts] of authorComments) {
    const targetCmts = cmts.filter(c => c.body.toLowerCase().includes(targetLower));
    const best = (targetCmts.length > 0 ? targetCmts : cmts).sort((a, b) => b.score - a.score)[0];
    if (!best || best.score < 10) continue;

    let points = best.score >= 100 ? 3 : best.score >= 50 ? 2 : 1;
    if (author === post.author) points += 2;

    let quote = best.body.split('\n').filter(l => !l.trim().startsWith('>')).join(' ').replace(/\s+/g, ' ').trim();
    if (quote.length > 400) quote = quote.slice(0, 400) + '...';

    haters.push({ username: author, points, quote, quoteScore: best.score, quoteLink: best.permalink });
  }

  haters.sort((a, b) => b.points - a.points || b.quoteScore - a.quoteScore);
  return { postId, postTitle: post.title, postAuthor: post.author, postScore: post.score, subreddit: sourceSubreddit, commentCount: comments.length, targetMentions, haters: haters.slice(0, 15) };
}

/**
 * Record haters and check achievements
 */
export async function recordAnalyzedHaters(
  context: AppContext,
  analysis: ThreadAnalysis
): Promise<{ added: number; achievements: Array<{ user: string; achievement: Achievement }> }> {
  const { getLeaderboard } = await import('./leaderboard.js');

  let data = await getLeaderboard(context);
  if (!data) {
    data = {
      updatedAt: Date.now(), totalHostileLinks: 0,
      subreddits: {}, subredditAltMappings: {}, topSubreddits: [],
      users: {}, userAltMappings: {}, topUsers: [],
    };
  }

  const subKey = analysis.subreddit.toLowerCase();
  const now = Date.now();
  const achievements: Array<{ user: string; achievement: Achievement }> = [];

  // Update subreddit
  if (!data.subreddits[subKey]) {
    data.subreddits[subKey] = { subreddit: analysis.subreddit, hostileLinks: 0, adversarialCount: 0, hatefulCount: 0, lastSeen: now };
  }
  data.subreddits[subKey].hostileLinks++;
  data.subreddits[subKey].adversarialCount++;
  data.subreddits[subKey].lastSeen = now;
  data.subreddits[subKey].worstTitle = analysis.postTitle.slice(0, 100);

  // Add haters
  for (const hater of analysis.haters) {
    const userKey = hater.username.toLowerCase();
    const isNew = !data.users[userKey];

    if (!data.users[userKey]) {
      data.users[userKey] = {
        username: hater.username, hostileLinks: 0, adversarialCount: 0, hatefulCount: 0,
        modLogSpamCount: 0, tributeRequestCount: 0, lastSeen: now, homeSubreddits: [],
      };
    }

    const entry = data.users[userKey];
    entry.hostileLinks++;
    entry.adversarialCount += hater.points;
    entry.lastSeen = now;

    if (!entry.featuredQuoteScore || hater.quoteScore > entry.featuredQuoteScore) {
      entry.featuredQuote = hater.quote;
      entry.featuredQuoteScore = hater.quoteScore;
      entry.featuredQuoteLink = hater.quoteLink;
    }
    if (!entry.homeSubreddits.includes(analysis.subreddit)) {
      entry.homeSubreddits.push(analysis.subreddit);
    }

    // Detect talking points in quote for meme achievements
    const detectedMemes = detectTalkingPoints(hater.quote);
    const memeIds = detectedMemes.map(m => m.id);

    // Check achievements with meme context
    const unlocks = await checkAchievements(context, hater.username, entry, data, {
      isFirstOffense: isNew,
      uniqueMemesUsed: memeIds,
    });

    // Record ALL unlocked achievements on leaderboard entry with timestamps
    for (const unlock of unlocks) {
      if (!entry.unlockedAchievements) entry.unlockedAchievements = {};
      if (!entry.unlockedAchievements[unlock.achievement.id]) {
        entry.unlockedAchievements[unlock.achievement.id] = now;
        // Add achievement XP
        const xp = ACHIEVEMENT_XP[unlock.achievement.tier] || 0;
        entry.achievementXP = (entry.achievementXP || 0) + xp;
        // Track highest tier
        if (!entry.highestAchievementTier ||
            getTierRank(unlock.achievement.tier) > getTierRank(entry.highestAchievementTier)) {
          entry.highestAchievementTier = unlock.achievement.tier;
        }
      }
    }

    // Get best new achievement to notify about
    const best = getHighestNewAchievement(unlocks);
    if (best?.shouldNotify) {
      achievements.push({ user: hater.username, achievement: best.achievement });
      hater.newAchievement = best.achievement;
    }
  }

  data.totalHostileLinks++;
  data.updatedAt = now;

  // Recalculate rankings
  data.topSubreddits = Object.values(data.subreddits)
    .filter(e => !e.isAltOf)
    .map(e => ({ subreddit: e.subreddit, score: e.adversarialCount + e.hatefulCount * 3, alts: e.knownAlts?.length || 0 }))
    .sort((a, b) => b.score - a.score).slice(0, 10);

  data.topUsers = Object.values(data.users)
    .filter(e => !e.isAltOf)
    .map(e => ({ username: e.username, score: e.adversarialCount + e.hatefulCount * 3 + e.modLogSpamCount * 2, alts: e.knownAlts?.length || 0 }))
    .sort((a, b) => b.score - a.score).slice(0, 10);

  // Save
  const subredditName = await context.reddit.getCurrentSubredditName();
  const content = JSON.stringify(data, null, 2);
  try {
    await context.reddit.updateWikiPage({ subredditName, page: 'hub-bot-9000/hater-leaderboard', content });
  } catch {
    await context.reddit.createWikiPage({ subredditName, page: 'hub-bot-9000/hater-leaderboard', content });
  }

  return { added: analysis.haters.length, achievements };
}

/**
 * Format sticky comment for crosslink thread
 */
export function formatStickyComment(
  analysis: ThreadAnalysis,
  achievements: Array<{ user: string; achievement: Achievement }>,
  targetSubreddit: string
): string {
  let comment = `**Crosslink detected from r/${analysis.subreddit}**\n\n`;
  comment += `This thread ([${analysis.postTitle.slice(0, 60)}...](https://reddit.com/r/${analysis.subreddit}/comments/${analysis.postId})) `;
  comment += `has ${analysis.commentCount} comments with ${analysis.targetMentions} mentions of r/${targetSubreddit}.\n\n`;

  if (analysis.haters.length > 0) {
    comment += `**Top participants tracked:**\n\n`;
    comment += `| User | Score | Quote |\n|------|-------|-------|\n`;

    for (const h of analysis.haters.slice(0, 10)) {
      const badge = h.newAchievement ? ` ${TIER_EMOJIS[h.newAchievement.tier]}` : '';
      const shortQuote = h.quote.length > 80 ? h.quote.slice(0, 80) + '...' : h.quote;
      comment += `| u/${h.username}${badge} | +${h.quoteScore} | ${shortQuote.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |\n`;
    }
  }

  if (achievements.length > 0) {
    comment += `\n**Achievements unlocked:**\n`;
    for (const { user, achievement } of achievements) {
      comment += `- ${TIER_EMOJIS[achievement.tier]} **u/${user}** earned *${achievement.name}*\n`;
    }
  }

  comment += `\n---\n*brigade-sentinel | [leaderboard](/r/${targetSubreddit}/wiki/hub-bot-9000/hater-leaderboard)*`;
  return comment;
}

/**
 * Full pipeline result type
 */
export interface AnalysisResult {
  success: boolean;
  message: string;
  hatersAdded?: number;
  analysis?: ThreadAnalysis;
  achievements?: Array<{ user: string; achievement: Achievement }>;
}

/**
 * Full pipeline: analyze, record, and return data for sticky comment
 */
export async function analyzeAndRecordThread(
  context: AppContext,
  postUrl: string,
  targetSubreddit: string
): Promise<AnalysisResult> {
  const match = postUrl.match(/reddit\.com\/r\/(\w+)\/comments\/(\w+)/i);
  if (!match) return { success: false, message: 'Invalid Reddit URL' };

  const [, sourceSubreddit, postId] = match;
  console.log(`[analysis] Analyzing ${sourceSubreddit}/${postId}`);

  const analysis = await analyzeThread(postId, sourceSubreddit, targetSubreddit);
  if (!analysis) return { success: false, message: 'Could not fetch thread' };
  if (analysis.haters.length === 0) return { success: true, message: 'No significant haters found', hatersAdded: 0, analysis };

  const { added, achievements } = await recordAnalyzedHaters(context, analysis);

  // Save detailed analysis to wiki archive
  await saveAnalysisToWiki(context, analysis, achievements, targetSubreddit);

  return {
    success: true,
    message: `Analyzed "${analysis.postTitle.slice(0, 40)}..." - ${added} haters, ${achievements.length} achievements`,
    hatersAdded: added,
    analysis,
    achievements,
  };
}

/**
 * Get thread analyses from wiki
 */
export async function getThreadAnalyses(context: AppContext): Promise<ThreadAnalysesData | null> {
  try {
    const subredditName = await context.reddit.getCurrentSubredditName();
    const page = await context.reddit.getWikiPage(subredditName, THREAD_ANALYSES_WIKI);
    if (!page?.content) return null;
    return JSON.parse(page.content) as ThreadAnalysesData;
  } catch {
    return null;
  }
}

/**
 * Save analysis to wiki archive (keeps last 50 analyses)
 */
export async function saveAnalysisToWiki(
  context: AppContext,
  analysis: ThreadAnalysis,
  achievements: Array<{ user: string; achievement: Achievement }>,
  targetSubreddit: string
): Promise<void> {
  const subredditName = await context.reddit.getCurrentSubredditName();

  // Get existing data
  let data = await getThreadAnalyses(context);
  if (!data) {
    data = { updatedAt: Date.now(), totalAnalyses: 0, analyses: [] };
  }

  // Create stored entry
  const stored: StoredAnalysis = {
    analyzedAt: Date.now(),
    postId: analysis.postId,
    postTitle: analysis.postTitle,
    postAuthor: analysis.postAuthor,
    postScore: analysis.postScore,
    sourceSubreddit: analysis.subreddit,
    targetSubreddit,
    commentCount: analysis.commentCount,
    targetMentions: analysis.targetMentions,
    hatersFound: analysis.haters.length,
    haters: analysis.haters.map(h => ({
      username: h.username,
      points: h.points,
      quote: h.quote,
      quoteScore: h.quoteScore,
      quoteLink: h.quoteLink,
      achievement: h.newAchievement?.name,
    })),
    achievements: achievements.map(a => ({
      user: a.user,
      achievementName: a.achievement.name,
      tier: a.achievement.tier,
    })),
  };

  // Add to front, keep last 50
  data.analyses.unshift(stored);
  data.analyses = data.analyses.slice(0, 50);
  data.totalAnalyses++;
  data.updatedAt = Date.now();

  // Save JSON
  const content = JSON.stringify(data, null, 2);
  try {
    await context.reddit.updateWikiPage({ subredditName, page: THREAD_ANALYSES_WIKI, content });
  } catch {
    await context.reddit.createWikiPage({ subredditName, page: THREAD_ANALYSES_WIKI, content });
  }
}

/**
 * Format detailed wiki markdown for a single analysis (full breakout)
 */
export function formatAnalysisMarkdown(stored: StoredAnalysis): string {
  const date = new Date(stored.analyzedAt).toISOString().split('T')[0];

  let md = `# Thread Analysis: r/${stored.sourceSubreddit}\n\n`;
  md += `**Analyzed:** ${date}\n\n`;
  md += `## Source Thread\n\n`;
  md += `- **Subreddit:** r/${stored.sourceSubreddit}\n`;
  md += `- **Title:** [${stored.postTitle}](https://reddit.com/r/${stored.sourceSubreddit}/comments/${stored.postId})\n`;
  md += `- **Author:** u/${stored.postAuthor}\n`;
  md += `- **Score:** ${stored.postScore}\n`;
  md += `- **Comments:** ${stored.commentCount}\n`;
  md += `- **Mentions of r/${stored.targetSubreddit}:** ${stored.targetMentions}\n\n`;

  if (stored.haters.length > 0) {
    md += `## Tracked Participants (${stored.hatersFound})\n\n`;

    for (const h of stored.haters) {
      const badge = h.achievement ? ` *(earned ${h.achievement})*` : '';
      md += `### u/${h.username}${badge}\n\n`;
      md += `- **Points:** ${h.points}\n`;
      md += `- **Quote Score:** +${h.quoteScore}\n`;
      md += `- **Source:** [link](${h.quoteLink})\n\n`;
      md += `> ${h.quote}\n\n`;
    }
  }

  if (stored.achievements.length > 0) {
    md += `## Achievements Unlocked\n\n`;
    for (const a of stored.achievements) {
      md += `- **u/${a.user}** earned **${a.achievementName}** (${a.tier})\n`;
    }
    md += '\n';
  }

  md += `---\n*Generated by brigade-sentinel*\n`;
  return md;
}

/**
 * Format summary markdown listing recent analyses
 */


/**
 * Get tier rank for comparison
 */
function getTierRank(tier: string): number {
  const ranks: Record<string, number> = {
    bronze: 1,
    silver: 2,
    gold: 3,
    platinum: 4,
    diamond: 5,
  };
  return ranks[tier] || 0;
}
export function formatAnalysesSummary(data: ThreadAnalysesData, targetSubreddit: string): string {
  let md = `# Thread Analyses Archive\n\n`;
  md += `**Total Analyses:** ${data.totalAnalyses}\n`;
  md += `**Last Updated:** ${new Date(data.updatedAt).toISOString()}\n\n`;

  if (data.analyses.length === 0) {
    md += `*No analyses recorded yet.*\n`;
    return md;
  }

  md += `## Recent Analyses\n\n`;
  md += `| Date | Source | Title | Haters | Achievements |\n`;
  md += `|------|--------|-------|--------|---------------|\n`;

  for (const a of data.analyses.slice(0, 25)) {
    const date = new Date(a.analyzedAt).toISOString().split('T')[0];
    const title = a.postTitle.length > 40 ? a.postTitle.slice(0, 40) + '...' : a.postTitle;
    const titleLink = `[${title.replace(/\|/g, '\\|')}](https://reddit.com/r/${a.sourceSubreddit}/comments/${a.postId})`;
    md += `| ${date} | r/${a.sourceSubreddit} | ${titleLink} | ${a.hatersFound} | ${a.achievements.length} |\n`;
  }

  md += `\n---\n*[View Leaderboard](/r/${targetSubreddit}/wiki/hub-bot-9000/hater-leaderboard)*\n`;
  return md;
}
