// Hater Leaderboards - track hostile crosslinks for posterity
// Separate leaderboards for subreddits and individual users
// Includes mod log spam check for additional scoring
// OSINT enrichment via deleted content analysis

import { TriggerContext, JobContext } from '@devvit/public-api';
import { SourceClassification } from './types.js';
import { analyzeDeletedContent, analyzeUser, BehavioralProfile } from './user-analysis.js';

type AppContext = TriggerContext | JobContext;

// Mod log action types that indicate spam/problematic behavior
const SPAM_MOD_ACTIONS = ['spamlink', 'spamcomment', 'removelink', 'removecomment', 'banuser'];

const WIKI_PAGE = 'hub-bot-9000/hater-leaderboard';

// Subreddit entry
export interface SubredditHaterEntry {
  subreddit: string;
  hostileLinks: number;
  adversarialCount: number;
  hatefulCount: number;
  lastSeen: number;
  worstTitle?: string;
  knownAlts?: string[];
  isAltOf?: string;
}

// Achievement XP values by tier
export const ACHIEVEMENT_XP: Record<string, number> = {
  bronze: 2,
  silver: 5,
  gold: 10,
  platinum: 20,
  diamond: 50,
};

// User entry
export interface UserHaterEntry {
  username: string;
  hostileLinks: number;
  adversarialCount: number;
  hatefulCount: number;
  modLogSpamCount: number;  // Times found in mod log for spam/removals
  tributeRequestCount: number;  // Tribute commands used (+0.5 points each)
  lastSeen: number;
  worstTitle?: string;
  homeSubreddits: string[]; // Where they post from
  knownAlts?: string[];
  isAltOf?: string;

  // Achievement tracking
  unlockedAchievements?: Record<string, number>;  // Achievement ID -> unlock timestamp
  achievementXP?: number;                         // Bonus XP from achievements
  highestAchievementTier?: string;                // Highest tier earned

  // Featured quote (most upvoted hateful comment)
  featuredQuote?: string;
  featuredQuoteScore?: number;
  featuredQuoteLink?: string;

  // OSINT enrichment (from deleted content analysis)
  deletedContentSummary?: string;
  flaggedContentCount?: number;
  osintEnrichedAt?: number;

  // The-Profiler behavioral analysis
  behavioralProfile?: BehavioralProfile;
  engagementStyle?: 'constructive' | 'neutral' | 'confrontational' | 'unknown';
  behaviorSummary?: string;
}

export interface LeaderboardData {
  updatedAt: number;
  totalHostileLinks: number;

  // Subreddit tracking
  subreddits: Record<string, SubredditHaterEntry>;
  subredditAltMappings: Record<string, string>;
  topSubreddits: Array<{ subreddit: string; score: number; alts?: number }>;

  // User tracking
  users: Record<string, UserHaterEntry>;
  userAltMappings: Record<string, string>;
  topUsers: Array<{ username: string; score: number; alts?: number }>;
}

/**
 * Check mod log for spam/removal actions against a user
 * Returns count of spam-related mod actions in the last 30 days
 */
export async function checkModLogForUser(
  context: AppContext,
  username: string
): Promise<number> {
  try {
    const subredditName = await context.reddit.getCurrentSubredditName();

    // Query mod log for spam-related actions against this user
    // We check multiple action types separately since 'all' isn't valid
    let spamCount = 0;
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    // Check for removecomment actions
    try {
      const removeCommentLogs = await context.reddit.getModerationLog({
        subredditName,
        type: 'removecomment',
        limit: 50,
      }).all();

      for (const entry of removeCommentLogs) {
        if (entry.target?.author?.toLowerCase() !== username.toLowerCase()) continue;
        if (entry.createdAt.getTime() < thirtyDaysAgo) continue;
        spamCount++;
      }
    } catch { /* ignore */ }

    // Check for removelink actions
    try {
      const removeLinkLogs = await context.reddit.getModerationLog({
        subredditName,
        type: 'removelink',
        limit: 50,
      }).all();

      for (const entry of removeLinkLogs) {
        if (entry.target?.author?.toLowerCase() !== username.toLowerCase()) continue;
        if (entry.createdAt.getTime() < thirtyDaysAgo) continue;
        spamCount++;
      }
    } catch { /* ignore */ }

    // Check for banuser actions
    try {
      const banLogs = await context.reddit.getModerationLog({
        subredditName,
        type: 'banuser',
        limit: 50,
      }).all();

      for (const entry of banLogs) {
        if (entry.target?.author?.toLowerCase() !== username.toLowerCase()) continue;
        if (entry.createdAt.getTime() < thirtyDaysAgo) continue;
        spamCount += 3; // Ban is more severe, counts as 3
      }
    } catch { /* ignore */ }

    return spamCount;
  } catch {
    // May not have mod permissions
    return 0;
  }
}

/**
 * Record a hostile crosslink for both leaderboards
 */
export async function recordHater(
  context: AppContext,
  sourceSubreddit: string,
  sourceUsername: string,
  classification: SourceClassification,
  postTitle: string
): Promise<void> {
  // Only track adversarial and hateful
  if (classification !== SourceClassification.ADVERSARIAL &&
      classification !== SourceClassification.HATEFUL) {
    return;
  }

  let data = await getLeaderboard(context);

  if (!data) {
    data = {
      updatedAt: Date.now(),
      totalHostileLinks: 0,
      subreddits: {},
      subredditAltMappings: {},
      topSubreddits: [],
      users: {},
      userAltMappings: {},
      topUsers: [],
    };
  }

  const isHateful = classification === SourceClassification.HATEFUL;

  // ========== SUBREDDIT TRACKING ==========
  const subKey = sourceSubreddit.toLowerCase();
  const mainSubKey = data.subredditAltMappings[subKey] || subKey;
  const subIsAlt = mainSubKey !== subKey;

  const mainSubName = subIsAlt && data.subreddits[mainSubKey]
    ? data.subreddits[mainSubKey].subreddit
    : sourceSubreddit;

  const subEntry: SubredditHaterEntry = data.subreddits[mainSubKey] || {
    subreddit: mainSubName,
    hostileLinks: 0,
    adversarialCount: 0,
    hatefulCount: 0,
    lastSeen: 0,
  };

  subEntry.hostileLinks++;
  subEntry.lastSeen = Date.now();
  if (isHateful) {
    subEntry.hatefulCount++;
    subEntry.worstTitle = postTitle.slice(0, 100);
  } else {
    subEntry.adversarialCount++;
  }
  data.subreddits[mainSubKey] = subEntry;

  // ========== USER TRACKING ==========
  const userKey = sourceUsername.toLowerCase();
  const mainUserKey = data.userAltMappings[userKey] || userKey;
  const userIsAlt = mainUserKey !== userKey;

  const mainUserName = userIsAlt && data.users[mainUserKey]
    ? data.users[mainUserKey].username
    : sourceUsername;

  const userEntry: UserHaterEntry = data.users[mainUserKey] || {
    username: mainUserName,
    hostileLinks: 0,
    adversarialCount: 0,
    hatefulCount: 0,
    modLogSpamCount: 0,
    tributeRequestCount: 0,
    lastSeen: 0,
    homeSubreddits: [],
  };

  userEntry.hostileLinks++;
  userEntry.lastSeen = Date.now();
  if (isHateful) {
    userEntry.hatefulCount++;
    userEntry.worstTitle = postTitle.slice(0, 100);
  } else {
    userEntry.adversarialCount++;
  }
  // Track which subs they post from
  if (!userEntry.homeSubreddits.includes(sourceSubreddit)) {
    userEntry.homeSubreddits.push(sourceSubreddit);
  }

  // Check mod log for spam actions (adds to score)
  const modLogSpam = await checkModLogForUser(context, sourceUsername);
  userEntry.modLogSpamCount = modLogSpam;

  data.users[mainUserKey] = userEntry;

  // ========== UPDATE TOTALS & LEADERBOARDS ==========
  data.totalHostileLinks++;
  data.updatedAt = Date.now();

  // Top subreddits
  data.topSubreddits = Object.values(data.subreddits)
    .filter(e => !e.isAltOf)
    .map(e => ({
      subreddit: e.subreddit,
      score: e.adversarialCount + (e.hatefulCount * 3),
      alts: e.knownAlts?.length || 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  // Top users (score includes mod log spam: +2 per spam action, +0.5 per tribute)
  data.topUsers = Object.values(data.users)
    .filter(e => !e.isAltOf)
    .map(e => ({
      username: e.username,
      score: e.adversarialCount + (e.hatefulCount * 3) + (e.modLogSpamCount * 2) + ((e.tributeRequestCount || 0) * 0.5),
      alts: e.knownAlts?.length || 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  await saveLeaderboard(context, data);
}

/**
 * Record a tribute request for a user (+0.5 hater points)
 * Used for playful leaderboard engagement
 */
export async function recordTributeRequest(
  context: AppContext,
  username: string
): Promise<void> {
  let data = await getLeaderboard(context);

  if (!data) {
    data = {
      updatedAt: Date.now(),
      totalHostileLinks: 0,
      subreddits: {},
      subredditAltMappings: {},
      topSubreddits: [],
      users: {},
      userAltMappings: {},
      topUsers: [],
    };
  }

  const userKey = username.toLowerCase();
  const mainUserKey = data.userAltMappings[userKey] || userKey;

  const mainUserName = mainUserKey !== userKey && data.users[mainUserKey]
    ? data.users[mainUserKey].username
    : username;

  const userEntry: UserHaterEntry = data.users[mainUserKey] || {
    username: mainUserName,
    hostileLinks: 0,
    adversarialCount: 0,
    hatefulCount: 0,
    modLogSpamCount: 0,
    tributeRequestCount: 0,
    lastSeen: 0,
    homeSubreddits: [],
  };

  userEntry.tributeRequestCount = (userEntry.tributeRequestCount || 0) + 1;
  userEntry.lastSeen = Date.now();
  data.users[mainUserKey] = userEntry;

  // Update top users list
  data.topUsers = Object.values(data.users)
    .filter(e => !e.isAltOf)
    .map(e => ({
      username: e.username,
      score: e.adversarialCount + (e.hatefulCount * 3) + (e.modLogSpamCount * 2) + ((e.tributeRequestCount || 0) * 0.5),
      alts: e.knownAlts?.length || 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  data.updatedAt = Date.now();
  await saveLeaderboard(context, data);
}

/**
 * Register an alt subreddit
 */
export async function registerSubredditAlt(
  context: AppContext,
  altSubreddit: string,
  mainSubreddit: string
): Promise<{ success: boolean; message: string }> {
  let data = await getLeaderboard(context);
  if (!data) data = createEmptyLeaderboard();

  const altKey = altSubreddit.toLowerCase();
  const mainKey = mainSubreddit.toLowerCase();

  if (data.subredditAltMappings[mainKey]) {
    return { success: false, message: `r/${mainSubreddit} is already an alt` };
  }
  if (altKey === mainKey) {
    return { success: false, message: "Can't link to itself" };
  }

  data.subredditAltMappings[altKey] = mainKey;

  const mainEntry: SubredditHaterEntry = data.subreddits[mainKey] || {
    subreddit: mainSubreddit, hostileLinks: 0, adversarialCount: 0, hatefulCount: 0, lastSeen: Date.now(),
  };
  mainEntry.knownAlts = mainEntry.knownAlts || [];
  if (!mainEntry.knownAlts.includes(altSubreddit)) mainEntry.knownAlts.push(altSubreddit);
  data.subreddits[mainKey] = mainEntry;

  if (data.subreddits[altKey]) data.subreddits[altKey].isAltOf = mainSubreddit;

  data.updatedAt = Date.now();
  await saveLeaderboard(context, data);

  return { success: true, message: `r/${altSubreddit} → r/${mainSubreddit}` };
}

/**
 * Register an alt user account
 */
export async function registerUserAlt(
  context: AppContext,
  altUsername: string,
  mainUsername: string
): Promise<{ success: boolean; message: string }> {
  let data = await getLeaderboard(context);
  if (!data) data = createEmptyLeaderboard();

  const altKey = altUsername.toLowerCase();
  const mainKey = mainUsername.toLowerCase();

  if (data.userAltMappings[mainKey]) {
    return { success: false, message: `u/${mainUsername} is already an alt` };
  }
  if (altKey === mainKey) {
    return { success: false, message: "Can't link to itself" };
  }

  data.userAltMappings[altKey] = mainKey;

  const mainEntry: UserHaterEntry = data.users[mainKey] || {
    username: mainUsername, hostileLinks: 0, adversarialCount: 0, hatefulCount: 0, modLogSpamCount: 0, tributeRequestCount: 0, lastSeen: Date.now(), homeSubreddits: [],
  };
  mainEntry.knownAlts = mainEntry.knownAlts || [];
  if (!mainEntry.knownAlts.includes(altUsername)) mainEntry.knownAlts.push(altUsername);
  data.users[mainKey] = mainEntry;

  if (data.users[altKey]) data.users[altKey].isAltOf = mainUsername;

  data.updatedAt = Date.now();
  await saveLeaderboard(context, data);

  return { success: true, message: `u/${altUsername} → u/${mainUsername}` };
}

function createEmptyLeaderboard(): LeaderboardData {
  return {
    updatedAt: Date.now(),
    totalHostileLinks: 0,
    subreddits: {},
    subredditAltMappings: {},
    topSubreddits: [],
    users: {},
    userAltMappings: {},
    topUsers: [],
  };
}

/**
 * Get the current leaderboard
 */
export async function getLeaderboard(
  context: AppContext
): Promise<LeaderboardData | null> {
  try {
    const subredditName = await context.reddit.getCurrentSubredditName();
    const wikiPage = await context.reddit.getWikiPage(subredditName, WIKI_PAGE);

    if (!wikiPage?.content) return null;
    return JSON.parse(wikiPage.content) as LeaderboardData;
  } catch {
    return null;
  }
}

/**
 * Save leaderboard to wiki
 */
async function saveLeaderboard(
  context: AppContext,
  data: LeaderboardData
): Promise<void> {
  const subredditName = await context.reddit.getCurrentSubredditName();
  const content = JSON.stringify(data, null, 2);

  try {
    await context.reddit.updateWikiPage({
      subredditName,
      page: WIKI_PAGE,
      content,
    });
  } catch {
    // Page doesn't exist, create it
    await context.reddit.createWikiPage({
      subredditName,
      page: WIKI_PAGE,
      content,
    });
  }
}

/**
 * Format leaderboard as markdown for display
 */
export function formatLeaderboardMarkdown(data: LeaderboardData): string {
  if (!data || (data.topSubreddits.length === 0 && data.topUsers.length === 0)) {
    return '## 🏆 Hater Leaderboards\n\n*No haters yet! (How wholesome)*';
  }

  let md = `## 🏆 Hater Leaderboards

*Last updated: ${new Date(data.updatedAt).toLocaleDateString()}*
*Total hostile crosslinks: ${data.totalHostileLinks}*

---

### 🏘️ Top Hater Subreddits

| Rank | Subreddit | Score | Alts |
|------|-----------|-------|------|
`;

  if (data.topSubreddits.length === 0) {
    md += `| - | *none yet* | - | - |\n`;
  } else {
    data.topSubreddits.forEach((entry, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const altBadge = (entry.alts || 0) > 0 ? `${entry.alts} 🎭` : '-';
      md += `| ${medal} | r/${entry.subreddit} | ${entry.score} | ${altBadge} |\n`;
    });
  }

  md += `
---

### 👤 Top Hater Users

| Rank | User | Score | Spam | Alts | Home Subs |
|------|------|-------|------|------|-----------|
`;

  if (data.topUsers.length === 0) {
    md += `| - | *none yet* | - | - | - | - |\n`;
  } else {
    data.topUsers.forEach((entry, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const altBadge = (entry.alts || 0) > 0 ? `${entry.alts} 🎭` : '-';
      const userData = data.users[entry.username.toLowerCase()];
      const homeSubs = userData?.homeSubreddits?.slice(0, 3).join(', ') || '-';
      const spamBadge = userData?.modLogSpamCount ? `${userData.modLogSpamCount} 🗑️` : '-';
      md += `| ${medal} | u/${entry.username} | ${entry.score} | ${spamBadge} | ${altBadge} | ${homeSubs} |\n`;
    });
  }

  md += `\n*Score = adversarial + (hateful × 3) + (mod log spam × 2) + (deleted content flags × 2). 🎭 = known alts. 🗑️ = mod log spam/removals.*`;

  // Show known alts
  const subAlts = Object.values(data.subreddits).filter(e => e.isAltOf);
  const userAlts = Object.values(data.users).filter(e => e.isAltOf);

  if (subAlts.length > 0 || userAlts.length > 0) {
    md += `\n\n---\n\n### 🎭 Known Alts\n`;
    if (subAlts.length > 0) {
      md += `\n**Subreddits:**\n`;
      subAlts.forEach(alt => md += `- r/${alt.subreddit} → r/${alt.isAltOf}\n`);
    }
    if (userAlts.length > 0) {
      md += `\n**Users:**\n`;
      userAlts.forEach(alt => md += `- u/${alt.username} → u/${alt.isAltOf}\n`);
    }
  }

  // Show featured quotes for top haters
  const usersWithQuotes = data.topUsers
    .slice(0, 5)
    .map(u => data.users[u.username.toLowerCase()])
    .filter(u => u?.featuredQuote);
  
  if (usersWithQuotes.length > 0) {
    md += `

---

### 💬 Featured Quotes
`;
    usersWithQuotes.forEach(user => {
      const quote = user.featuredQuote!;
      md += `
**u/${user.username}** (+${user.featuredQuoteScore || 0})
`;
      md += `> ${quote}...
`;
      if (user.featuredQuoteLink) {
        md += `> [source](${user.featuredQuoteLink})
`;
      }
    });
  }

  // Show OSINT insights for enriched users (The-Profiler + Deleted Content)
  const enrichedUsers = Object.values(data.users).filter(e => e.deletedContentSummary || e.behavioralProfile);
  if (enrichedUsers.length > 0) {
    md += `\n\n---\n\n### 🔍 OSINT Insights (The-Profiler Analysis)\n`;
    enrichedUsers.slice(0, 5).forEach(user => {
      md += `\n**u/${user.username}**`;
      if (user.flaggedContentCount) {
        md += ` (${user.flaggedContentCount} flagged items)`;
      }
      md += `\n`;

      // The-Profiler behavioral profile
      if (user.behavioralProfile) {
        const bp = user.behavioralProfile;
        if (bp.ocean) {
          md += `> **OCEAN:** O:${bp.ocean.openness} C:${bp.ocean.conscientiousness} E:${bp.ocean.extraversion} A:${bp.ocean.agreeableness} N:${bp.ocean.neuroticism}\n`;
        }
        if (bp.communicationStyle) {
          const cs = bp.communicationStyle;
          md += `> **Style:** ${cs.verbosity}, ${cs.formality}, ${cs.emotionalTone}, ${cs.argumentationStyle}\n`;
        }
        if (bp.moderationRisk) {
          const mr = bp.moderationRisk;
          md += `> **Risk:** Trolling:${mr.trollingLikelihood} Sockpuppet:${mr.sockpuppetRisk}`;
          if (mr.brigadingPattern) md += ` ⚠️Brigade pattern`;
          if (mr.deceptionIndicators > 0) md += ` (${mr.deceptionIndicators} deception flags)`;
          md += `\n`;
        }
        md += `> *Confidence: ${bp.confidence} (${bp.sampleSize} samples)*\n`;
      }

      // Engagement style summary
      if (user.engagementStyle) {
        md += `> **Engagement:** ${user.engagementStyle}\n`;
      }
      if (user.behaviorSummary) {
        md += `> ${user.behaviorSummary}\n`;
      }

      // Deleted content summary
      if (user.deletedContentSummary) {
        md += `> **Deleted content:** ${user.deletedContentSummary}\n`;
      }
    });
  }

  return md;
}

/**
 * Enrich top haters with OSINT data (deleted content + The-Profiler behavioral analysis)
 * Call this periodically to update profiles of worst offenders
 */
export async function enrichTopHatersWithOSINT(
  context: AppContext,
  geminiApiKey: string,
  options?: { topN?: number }
): Promise<{ enriched: number; errors: number }> {
  const topN = options?.topN || 5;
  let enriched = 0;
  let errors = 0;

  const data = await getLeaderboard(context);
  if (!data) return { enriched: 0, errors: 0 };

  // Get top N haters that haven't been enriched recently (7 days)
  const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

  const hatersToEnrich = data.topUsers
    .filter(u => {
      const userData = data.users[u.username.toLowerCase()];
      return !userData?.osintEnrichedAt || userData.osintEnrichedAt < oneWeekAgo;
    })
    .slice(0, topN);

  for (const hater of hatersToEnrich) {
    const userKey = hater.username.toLowerCase();
    const userEntry = data.users[userKey];
    if (!userEntry) continue;

    try {
      // Run full The-Profiler analysis (includes deleted content via PullPush)
      const fullAnalysis = await analyzeUser(context, hater.username, {
        geminiApiKey,
        includeRecentPosts: true,
        deepBehavioralAnalysis: true,  // The-Profiler OCEAN + communication style
      });

      // Store behavioral profile
      if (fullAnalysis.behavioralProfile) {
        userEntry.behavioralProfile = fullAnalysis.behavioralProfile;
      }
      if (fullAnalysis.engagementStyle) {
        userEntry.engagementStyle = fullAnalysis.engagementStyle;
      }
      if (fullAnalysis.behaviorSummary) {
        userEntry.behaviorSummary = fullAnalysis.behaviorSummary;
      }

      // Also analyze deleted content separately for flagging
      const deletedAnalysis = await analyzeDeletedContent(hater.username, geminiApiKey);

      if (deletedAnalysis) {
        userEntry.deletedContentSummary = deletedAnalysis.summary;
        userEntry.flaggedContentCount = deletedAnalysis.flaggedContent.length;
      }

      userEntry.osintEnrichedAt = Date.now();
      data.users[userKey] = userEntry;
      enriched++;
    } catch {
      errors++;
    }
  }

  // Update score calculation to include flagged content and tributes
  data.topUsers = Object.values(data.users)
    .filter(e => !e.isAltOf)
    .map(e => ({
      username: e.username,
      score: e.adversarialCount +
             (e.hatefulCount * 3) +
             (e.modLogSpamCount * 2) +
             ((e.flaggedContentCount || 0) * 2) +  // Deleted bad content adds points
             ((e.tributeRequestCount || 0) * 0.5),  // Tributes add small points
      alts: e.knownAlts?.length || 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  data.updatedAt = Date.now();
  await saveLeaderboard(context, data);

  return { enriched, errors };
}

/**
 * Get detailed OSINT report for a specific user
 */
export async function getHaterOSINTReport(
  context: AppContext,
  username: string,
  geminiApiKey: string
): Promise<{
  basicInfo: UserHaterEntry | null;
  deletedAnalysis: { flaggedContent: Array<{ text: string; reason: string; severity: string }>; summary: string } | null;
  behavioralProfile: Awaited<ReturnType<typeof analyzeUser>>['behavioralProfile'];
}> {
  const data = await getLeaderboard(context);
  const userKey = username.toLowerCase();

  const basicInfo = data?.users[userKey] || null;

  // Get deleted content analysis
  const deletedAnalysis = await analyzeDeletedContent(username, geminiApiKey);

  // Get deep behavioral profile
  const fullAnalysis = await analyzeUser(context, username, {
    geminiApiKey,
    includeRecentPosts: true,
    deepBehavioralAnalysis: true,
  });

  return {
    basicInfo,
    deletedAnalysis,
    behavioralProfile: fullAnalysis.behavioralProfile,
  };
}
