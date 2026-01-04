/**
 * Thread Analyzer - Deep brigade detection for suspicious threads
 *
 * Analyzes a thread to find evidence of coordinated brigading by examining:
 * 1. Commenter origin - where do commenters usually post?
 * 2. First-time posters - users who never posted here before
 * 3. Account patterns - age, karma, activity gaps
 * 4. Temporal waves - coordinated arrival times
 * 5. Content clustering - similar talking points
 */

import { TriggerContext, JobContext, Comment, User } from '@devvit/public-api';
import { searchComments, getDeletedComments } from './pullpush.js';
import { detectTalkingPoints, TalkingPoint } from './meme-detector.js';

// ============================================================================
// Types
// ============================================================================

export interface CommenterProfile {
  username: string;
  // Account metadata
  accountAge: number; // days
  karma: number;
  // Activity in target subreddit
  priorPostsInSub: number;
  priorCommentsInSub: number;
  isFirstTimeInSub: boolean;
  // Home subreddits (where they usually post)
  homeSubreddits: SubredditActivity[];
  // Comment in this thread
  commentId: string;
  commentBody: string;
  commentTime: number;
  // Flags
  isSuspicious: boolean;
  suspicionReasons: string[];
  // Detected talking points
  talkingPoints: string[];
}

export interface SubredditActivity {
  subreddit: string;
  count: number;
  percentage: number;
}

export interface TemporalWave {
  startTime: number;
  endTime: number;
  commentCount: number;
  uniqueUsers: number;
  outsiderCount: number; // users not regular to the sub
  intensity: number; // comments per minute
}

export interface BrigadeEvidence {
  // Summary
  confidence: 'low' | 'medium' | 'high' | 'very_high';
  confidenceScore: number; // 0-100
  summary: string;

  // Thread metadata
  postId: string;
  postTitle: string;
  postUrl: string;
  subreddit: string;
  totalComments: number;
  analyzedComments: number;

  // Commenter analysis
  uniqueCommenters: number;
  firstTimePosters: number;
  firstTimePosterPercentage: number;
  suspiciousAccounts: number;

  // Origin analysis
  topSourceSubreddits: SubredditActivity[];
  outsiderPercentage: number; // % of commenters who don't normally post here

  // Temporal analysis
  waves: TemporalWave[];
  hasCoordinatedWave: boolean;

  // Content analysis
  commonTalkingPoints: Array<{ point: string; count: number }>;
  deletedCommentCount: number;

  // Individual profiles (top suspicious)
  suspiciousProfiles: CommenterProfile[];

  // Raw data for further analysis
  allProfiles: CommenterProfile[];
}

export interface AnalyzeThreadOptions {
  maxComments?: number; // Max comments to analyze (default: 200)
  historyDepth?: number; // How many comments to check per user (default: 100)
  includeDeleted?: boolean; // Check PullPush for deleted comments
  subredditBaseline?: Map<string, number>; // Expected subreddit distribution
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze a thread for brigade evidence
 */
export async function analyzeThreadForBrigade(
  context: TriggerContext | JobContext,
  postId: string,
  options: AnalyzeThreadOptions = {}
): Promise<BrigadeEvidence> {
  const {
    maxComments = 200,
    historyDepth = 100,
    includeDeleted = true,
  } = options;

  // Get post details
  const post = await context.reddit.getPostById(postId);
  if (!post) {
    throw new Error(`Post not found: ${postId}`);
  }

  const subreddit = post.subredditName;
  const postUrl = `https://reddit.com${post.permalink}`;

  console.log(`[thread-analyzer] Analyzing ${postId} in r/${subreddit}`);

  // Get comments on the thread
  const comments = await getThreadComments(context, postId, maxComments);
  console.log(`[thread-analyzer] Found ${comments.length} comments`);

  // Get deleted comments if enabled
  let deletedComments: Array<{ author: string; body: string; created_utc: number }> = [];
  if (includeDeleted) {
    try {
      const pullpushComments = await getDeletedComments(postId.replace('t3_', ''));
      deletedComments = pullpushComments.filter(c =>
        c.author !== '[deleted]' &&
        c.body !== '[deleted]' &&
        c.body !== '[removed]'
      );
      console.log(`[thread-analyzer] Found ${deletedComments.length} archived comments from PullPush`);
    } catch (e) {
      console.log(`[thread-analyzer] PullPush unavailable: ${e}`);
    }
  }

  // Build unique commenter list
  const commenterMap = new Map<string, { commentId: string; body: string; time: number }>();
  for (const comment of comments) {
    const author = comment.authorName;
    if (!author || author === '[deleted]' || author === 'AutoModerator') continue;
    if (!commenterMap.has(author)) {
      commenterMap.set(author, {
        commentId: comment.id,
        body: comment.body,
        time: comment.createdAt.getTime(),
      });
    }
  }

  // Add deleted comment authors
  for (const dc of deletedComments) {
    if (!commenterMap.has(dc.author)) {
      commenterMap.set(dc.author, {
        commentId: `deleted_${dc.created_utc}`,
        body: dc.body,
        time: dc.created_utc * 1000,
      });
    }
  }

  console.log(`[thread-analyzer] Analyzing ${commenterMap.size} unique commenters`);

  // Analyze each commenter
  const profiles: CommenterProfile[] = [];
  let analyzed = 0;

  for (const [username, commentData] of commenterMap) {
    try {
      const profile = await analyzeCommenter(
        context,
        username,
        subreddit,
        commentData,
        historyDepth
      );
      profiles.push(profile);
      analyzed++;

      // Rate limit - don't hammer the API
      if (analyzed % 10 === 0) {
        console.log(`[thread-analyzer] Analyzed ${analyzed}/${commenterMap.size} commenters`);
        await sleep(500);
      }
    } catch (e) {
      console.log(`[thread-analyzer] Failed to analyze u/${username}: ${e}`);
    }
  }

  // Aggregate analysis
  const evidence = aggregateEvidence(
    profiles,
    post.id,
    post.title,
    postUrl,
    subreddit,
    comments.length,
    deletedComments.length
  );

  return evidence;
}

// ============================================================================
// Commenter Analysis
// ============================================================================

async function analyzeCommenter(
  context: TriggerContext | JobContext,
  username: string,
  targetSubreddit: string,
  commentData: { commentId: string; body: string; time: number },
  historyDepth: number
): Promise<CommenterProfile> {
  const suspicionReasons: string[] = [];

  // Get user info
  let user: User | undefined;
  let accountAge = 0;
  let karma = 0;

  try {
    user = await context.reddit.getUserByUsername(username);
    if (user) {
      const createdAt = user.createdAt;
      accountAge = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      karma = (user.linkKarma || 0) + (user.commentKarma || 0);
    }
  } catch {
    // User may be suspended/deleted
  }

  // Check account age
  if (accountAge < 30) {
    suspicionReasons.push(`New account (${accountAge} days old)`);
  }
  if (accountAge > 365 && karma < 100) {
    suspicionReasons.push(`Old account with low karma (${karma})`);
  }

  // Get user's comment history
  const subredditCounts = new Map<string, number>();
  let priorCommentsInSub = 0;
  let priorPostsInSub = 0;

  try {
    // Get recent comments
    const userComments = await context.reddit.getCommentsByUser({
      username,
      limit: historyDepth,
      sort: 'new',
    }).all();

    for (const c of userComments) {
      const sub = c.subredditName;
      subredditCounts.set(sub, (subredditCounts.get(sub) || 0) + 1);

      if (sub.toLowerCase() === targetSubreddit.toLowerCase()) {
        // Check if this comment is older than the current thread comment
        if (c.createdAt.getTime() < commentData.time && c.id !== commentData.commentId) {
          priorCommentsInSub++;
        }
      }
    }

    // Get recent posts
    const userPosts = await context.reddit.getPostsByUser({
      username,
      limit: 50,
      sort: 'new',
    }).all();

    for (const p of userPosts) {
      const sub = p.subredditName;
      subredditCounts.set(sub, (subredditCounts.get(sub) || 0) + 1);

      if (sub.toLowerCase() === targetSubreddit.toLowerCase()) {
        priorPostsInSub++;
      }
    }
  } catch {
    // User history unavailable
  }

  // Build home subreddits list
  const totalActivity = Array.from(subredditCounts.values()).reduce((a, b) => a + b, 0);
  const homeSubreddits: SubredditActivity[] = Array.from(subredditCounts.entries())
    .map(([sub, count]) => ({
      subreddit: sub,
      count,
      percentage: totalActivity > 0 ? Math.round((count / totalActivity) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Check if first-time poster
  const isFirstTimeInSub = priorCommentsInSub === 0 && priorPostsInSub === 0;
  if (isFirstTimeInSub) {
    suspicionReasons.push('First time posting in this subreddit');
  }

  // Check if they primarily post in a different but related subreddit
  const targetSubLower = targetSubreddit.toLowerCase();
  for (const home of homeSubreddits) {
    const homeLower = home.subreddit.toLowerCase();
    // Check for rival/related subreddits
    if (home.percentage > 30 && homeLower !== targetSubLower) {
      // Seattle-specific checks
      if (targetSubLower === 'seattlewa' && homeLower === 'seattle') {
        suspicionReasons.push(`Primary activity in rival subreddit r/${home.subreddit} (${home.percentage}%)`);
      } else if (targetSubLower === 'seattle' && homeLower === 'seattlewa') {
        suspicionReasons.push(`Primary activity in rival subreddit r/${home.subreddit} (${home.percentage}%)`);
      }
    }
  }

  // Detect talking points in comment
  const talkingPoints = detectTalkingPoints(commentData.body).map((tp: TalkingPoint) => tp.id);
  if (talkingPoints.length > 0) {
    suspicionReasons.push(`Uses known talking points: ${talkingPoints.join(', ')}`);
  }

  return {
    username,
    accountAge,
    karma,
    priorPostsInSub,
    priorCommentsInSub,
    isFirstTimeInSub,
    homeSubreddits,
    commentId: commentData.commentId,
    commentBody: commentData.body,
    commentTime: commentData.time,
    isSuspicious: suspicionReasons.length >= 2,
    suspicionReasons,
    talkingPoints,
  };
}

// ============================================================================
// Thread Comments Fetching
// ============================================================================

async function getThreadComments(
  context: TriggerContext | JobContext,
  postId: string,
  maxComments: number
): Promise<Comment[]> {
  const comments: Comment[] = [];

  try {
    const listing = await context.reddit.getComments({
      postId,
      limit: maxComments,
      sort: 'new',
    }).all();

    comments.push(...listing);
  } catch (e) {
    console.log(`[thread-analyzer] Error fetching comments: ${e}`);
  }

  return comments;
}

// ============================================================================
// Evidence Aggregation
// ============================================================================

function aggregateEvidence(
  profiles: CommenterProfile[],
  postId: string,
  postTitle: string,
  postUrl: string,
  subreddit: string,
  totalComments: number,
  deletedCommentCount: number
): BrigadeEvidence {
  // Count first-time posters
  const firstTimePosters = profiles.filter(p => p.isFirstTimeInSub);
  const firstTimePosterPercentage = profiles.length > 0
    ? Math.round((firstTimePosters.length / profiles.length) * 100)
    : 0;

  // Count suspicious accounts
  const suspiciousAccounts = profiles.filter(p => p.isSuspicious);

  // Aggregate source subreddits (excluding target subreddit)
  const sourceSubCounts = new Map<string, number>();
  for (const profile of profiles) {
    if (profile.isFirstTimeInSub) {
      for (const home of profile.homeSubreddits) {
        if (home.subreddit.toLowerCase() !== subreddit.toLowerCase()) {
          sourceSubCounts.set(
            home.subreddit,
            (sourceSubCounts.get(home.subreddit) || 0) + 1
          );
        }
      }
    }
  }

  const topSourceSubreddits: SubredditActivity[] = Array.from(sourceSubCounts.entries())
    .map(([sub, count]) => ({
      subreddit: sub,
      count,
      percentage: firstTimePosters.length > 0
        ? Math.round((count / firstTimePosters.length) * 100)
        : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Temporal wave analysis
  const waves = detectTemporalWaves(profiles);
  const hasCoordinatedWave = waves.some(w => w.outsiderCount >= 5 && w.intensity > 2);

  // Talking point aggregation
  const talkingPointCounts = new Map<string, number>();
  for (const profile of profiles) {
    for (const tp of profile.talkingPoints) {
      talkingPointCounts.set(tp, (talkingPointCounts.get(tp) || 0) + 1);
    }
  }
  const commonTalkingPoints = Array.from(talkingPointCounts.entries())
    .map(([point, count]) => ({ point, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Calculate confidence score
  let confidenceScore = 0;

  // High first-time poster rate
  if (firstTimePosterPercentage > 50) confidenceScore += 30;
  else if (firstTimePosterPercentage > 30) confidenceScore += 20;
  else if (firstTimePosterPercentage > 20) confidenceScore += 10;

  // Concentrated source subreddit
  if (topSourceSubreddits.length > 0 && topSourceSubreddits[0].percentage > 40) {
    confidenceScore += 25;
  } else if (topSourceSubreddits.length > 0 && topSourceSubreddits[0].percentage > 25) {
    confidenceScore += 15;
  }

  // Coordinated waves
  if (hasCoordinatedWave) confidenceScore += 20;

  // Suspicious accounts
  if (suspiciousAccounts.length > 10) confidenceScore += 15;
  else if (suspiciousAccounts.length > 5) confidenceScore += 10;

  // Common talking points
  if (commonTalkingPoints.length > 0 && commonTalkingPoints[0].count > 5) {
    confidenceScore += 10;
  }

  // Deleted comments
  if (deletedCommentCount > 10) confidenceScore += 10;

  // Determine confidence level
  let confidence: 'low' | 'medium' | 'high' | 'very_high';
  if (confidenceScore >= 70) confidence = 'very_high';
  else if (confidenceScore >= 50) confidence = 'high';
  else if (confidenceScore >= 30) confidence = 'medium';
  else confidence = 'low';

  // Build summary
  const summaryParts: string[] = [];
  if (firstTimePosterPercentage > 30) {
    summaryParts.push(`${firstTimePosterPercentage}% first-time posters`);
  }
  if (topSourceSubreddits.length > 0 && topSourceSubreddits[0].count >= 3) {
    summaryParts.push(`${topSourceSubreddits[0].count} users from r/${topSourceSubreddits[0].subreddit}`);
  }
  if (hasCoordinatedWave) {
    summaryParts.push('coordinated arrival pattern detected');
  }
  if (suspiciousAccounts.length > 5) {
    summaryParts.push(`${suspiciousAccounts.length} suspicious accounts`);
  }

  const summary = summaryParts.length > 0
    ? `Brigade indicators: ${summaryParts.join(', ')}`
    : 'No significant brigade indicators detected';

  return {
    confidence,
    confidenceScore,
    summary,
    postId,
    postTitle,
    postUrl,
    subreddit,
    totalComments,
    analyzedComments: profiles.length,
    uniqueCommenters: profiles.length,
    firstTimePosters: firstTimePosters.length,
    firstTimePosterPercentage,
    suspiciousAccounts: suspiciousAccounts.length,
    topSourceSubreddits,
    outsiderPercentage: firstTimePosterPercentage,
    waves,
    hasCoordinatedWave,
    commonTalkingPoints,
    deletedCommentCount,
    suspiciousProfiles: suspiciousAccounts.slice(0, 20),
    allProfiles: profiles,
  };
}

// ============================================================================
// Temporal Wave Detection
// ============================================================================

function detectTemporalWaves(profiles: CommenterProfile[]): TemporalWave[] {
  if (profiles.length === 0) return [];

  // Sort by comment time
  const sorted = [...profiles].sort((a, b) => a.commentTime - b.commentTime);

  const waves: TemporalWave[] = [];
  const windowMs = 10 * 60 * 1000; // 10-minute windows

  let windowStart = sorted[0].commentTime;
  let windowProfiles: CommenterProfile[] = [];

  for (const profile of sorted) {
    if (profile.commentTime - windowStart > windowMs) {
      // Process current window if significant
      if (windowProfiles.length >= 3) {
        const outsiders = windowProfiles.filter(p => p.isFirstTimeInSub);
        const durationMinutes = (windowProfiles[windowProfiles.length - 1].commentTime - windowStart) / 60000;

        waves.push({
          startTime: windowStart,
          endTime: windowProfiles[windowProfiles.length - 1].commentTime,
          commentCount: windowProfiles.length,
          uniqueUsers: windowProfiles.length,
          outsiderCount: outsiders.length,
          intensity: durationMinutes > 0 ? windowProfiles.length / durationMinutes : windowProfiles.length,
        });
      }

      // Start new window
      windowStart = profile.commentTime;
      windowProfiles = [profile];
    } else {
      windowProfiles.push(profile);
    }
  }

  // Process final window
  if (windowProfiles.length >= 3) {
    const outsiders = windowProfiles.filter(p => p.isFirstTimeInSub);
    const durationMinutes = (windowProfiles[windowProfiles.length - 1].commentTime - windowStart) / 60000;

    waves.push({
      startTime: windowStart,
      endTime: windowProfiles[windowProfiles.length - 1].commentTime,
      commentCount: windowProfiles.length,
      uniqueUsers: windowProfiles.length,
      outsiderCount: outsiders.length,
      intensity: durationMinutes > 0 ? windowProfiles.length / durationMinutes : windowProfiles.length,
    });
  }

  return waves.filter(w => w.commentCount >= 5 || w.outsiderCount >= 3);
}

// ============================================================================
// Report Formatting
// ============================================================================

/**
 * Format brigade evidence as markdown for modmail or wiki
 */
export function formatBrigadeReport(evidence: BrigadeEvidence): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Brigade Analysis Report`);
  lines.push(``);
  lines.push(`**Thread:** [${evidence.postTitle}](${evidence.postUrl})`);
  lines.push(`**Confidence:** ${evidence.confidence.toUpperCase()} (${evidence.confidenceScore}/100)`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(evidence.summary);
  lines.push(``);

  // Stats
  lines.push(`## Statistics`);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Comments | ${evidence.totalComments} |`);
  lines.push(`| Unique Commenters Analyzed | ${evidence.uniqueCommenters} |`);
  lines.push(`| First-Time Posters | ${evidence.firstTimePosters} (${evidence.firstTimePosterPercentage}%) |`);
  lines.push(`| Suspicious Accounts | ${evidence.suspiciousAccounts} |`);
  lines.push(`| Deleted Comments (PullPush) | ${evidence.deletedCommentCount} |`);
  lines.push(``);

  // Source subreddits
  if (evidence.topSourceSubreddits.length > 0) {
    lines.push(`## Source Subreddits`);
    lines.push(`Where first-time posters usually participate:`);
    lines.push(``);
    lines.push(`| Subreddit | Users | % of Outsiders |`);
    lines.push(`|-----------|-------|----------------|`);
    for (const source of evidence.topSourceSubreddits.slice(0, 10)) {
      lines.push(`| r/${source.subreddit} | ${source.count} | ${source.percentage}% |`);
    }
    lines.push(``);
  }

  // Temporal waves
  if (evidence.waves.length > 0) {
    lines.push(`## Activity Waves`);
    lines.push(`| Time | Comments | Outsiders | Intensity |`);
    lines.push(`|------|----------|-----------|-----------|`);
    for (const wave of evidence.waves) {
      const time = new Date(wave.startTime).toLocaleTimeString();
      lines.push(`| ${time} | ${wave.commentCount} | ${wave.outsiderCount} | ${wave.intensity.toFixed(1)}/min |`);
    }
    lines.push(``);
  }

  // Talking points
  if (evidence.commonTalkingPoints.length > 0) {
    lines.push(`## Common Talking Points`);
    for (const tp of evidence.commonTalkingPoints) {
      lines.push(`- **${tp.point}**: ${tp.count} users`);
    }
    lines.push(``);
  }

  // Top suspicious profiles
  if (evidence.suspiciousProfiles.length > 0) {
    lines.push(`## Suspicious Accounts (Top 10)`);
    lines.push(``);
    for (const profile of evidence.suspiciousProfiles.slice(0, 10)) {
      lines.push(`### u/${profile.username}`);
      lines.push(`- Account age: ${profile.accountAge} days, Karma: ${profile.karma}`);
      lines.push(`- Prior activity in sub: ${profile.priorCommentsInSub} comments, ${profile.priorPostsInSub} posts`);
      if (profile.homeSubreddits.length > 0) {
        const homes = profile.homeSubreddits.slice(0, 3).map(h => `r/${h.subreddit} (${h.percentage}%)`);
        lines.push(`- Usually posts in: ${homes.join(', ')}`);
      }
      lines.push(`- **Flags:** ${profile.suspicionReasons.join('; ')}`);
      lines.push(``);
    }
  }

  // Footer
  lines.push(`---`);
  lines.push(`*Generated by brigade-sentinel thread analyzer*`);

  return lines.join('\n');
}

/**
 * Format a short summary for modmail alerts
 */
export function formatBrigadeAlert(evidence: BrigadeEvidence): string {
  const lines: string[] = [];

  lines.push(`**[${evidence.confidence.toUpperCase()}] Brigade Analysis: ${evidence.postTitle}**`);
  lines.push(``);
  lines.push(evidence.summary);
  lines.push(``);
  lines.push(`- ${evidence.firstTimePosters}/${evidence.uniqueCommenters} first-time posters (${evidence.firstTimePosterPercentage}%)`);

  if (evidence.topSourceSubreddits.length > 0) {
    const top = evidence.topSourceSubreddits[0];
    lines.push(`- Top source: r/${top.subreddit} (${top.count} users)`);
  }

  if (evidence.hasCoordinatedWave) {
    lines.push(`- ⚠️ Coordinated arrival pattern detected`);
  }

  lines.push(``);
  lines.push(`[View full report](${evidence.postUrl})`);

  return lines.join('\n');
}

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format brigade evidence as a sticky comment for the target post
 * Shows who is brigading THIS specific post
 */
export function formatBrigadeStickyComment(
  evidence: BrigadeEvidence,
  sourceSubreddit: string,
  sourceUrl: string
): string {
  const lines: string[] = [];

  // Header
  lines.push(`**⚠️ Crosslink Alert from r/${sourceSubreddit}**`);
  lines.push(``);
  lines.push(`This thread was linked from [r/${sourceSubreddit}](${sourceUrl}).`);
  lines.push(``);

  // Show brigade stats if significant
  if (evidence.firstTimePosterPercentage >= 20 || evidence.firstTimePosters >= 3) {
    lines.push(`**${evidence.firstTimePosters}** of **${evidence.uniqueCommenters}** commenters (${evidence.firstTimePosterPercentage}%) are posting here for the first time.`);
    lines.push(``);
  }

  // Show top source subreddits (where first-timers come from)
  if (evidence.topSourceSubreddits.length > 0) {
    const topSources = evidence.topSourceSubreddits.slice(0, 3);
    if (topSources.length > 0 && topSources[0].count >= 2) {
      lines.push(`**Where first-time visitors usually post:**`);
      for (const source of topSources) {
        if (source.count >= 2) {
          lines.push(`- r/${source.subreddit}: ${source.count} users`);
        }
      }
      lines.push(``);
    }
  }

  // Show suspicious accounts if any
  if (evidence.suspiciousProfiles.length >= 3) {
    lines.push(`**${evidence.suspiciousAccounts} accounts** flagged for suspicious patterns.`);
    lines.push(``);
  }

  // Coordinated wave warning
  if (evidence.hasCoordinatedWave) {
    lines.push(`⚠️ *Coordinated arrival pattern detected*`);
    lines.push(``);
  }

  // Footer
  lines.push(`---`);
  lines.push(`*brigade-sentinel • [leaderboard](/r/${evidence.subreddit}/wiki/hub-bot-9000/hater-leaderboard)*`);

  return lines.join('\n');
}
