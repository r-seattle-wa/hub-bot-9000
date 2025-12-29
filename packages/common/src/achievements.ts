// Hater Achievement System
// Gamified recognition of dedicated haters with AI-generated roasts and badges

import { TriggerContext, JobContext } from '@devvit/public-api';
import { getJson, setJson, REDIS_PREFIX } from './redis.js';
import { UserHaterEntry, LeaderboardData } from './leaderboard.js';

type AppContext = TriggerContext | JobContext;

// Achievement tiers (Xbox-style)
export enum AchievementTier {
  BRONZE = 'bronze',
  SILVER = 'silver',
  GOLD = 'gold',
  PLATINUM = 'platinum',
  DIAMOND = 'diamond',
}

// Achievement definition
export interface Achievement {
  id: string;
  name: string;
  description: string;
  tier: AchievementTier;
  scoreThreshold?: number;  // Min score to unlock
  rankThreshold?: number;   // Min rank to unlock (e.g., top 10)
  special?: 'first_offense' | 'alt_exposed' | 'meme_repeater' | 'streak';
  imagePrompt: string;      // For GenAI image generation
  roastTemplate: string;    // Base template for AI to enhance
}

// User's achievement record
export interface UserAchievements {
  username: string;
  unlockedAchievements: string[];     // Achievement IDs
  notifiedAchievements: string[];     // Already commented about
  lastAchievementAt: number;
  lastNotificationAt: number;
  totalAchievements: number;
  highestTier: AchievementTier;
}

// Achievement unlock result
export interface AchievementUnlock {
  achievement: Achievement;
  isNew: boolean;               // First time unlocking
  shouldNotify: boolean;        // Should post comment (cooldown check)
  leaderboardPosition: number;
  previousPosition?: number;
}

// Define all achievements
export const ACHIEVEMENTS: Achievement[] = [
  // ===== SCORE MILESTONES =====
  {
    id: 'casual_complainer',
    name: 'Casual Complainer',
    description: 'Achieved 5 salt points',
    tier: AchievementTier.BRONZE,
    scoreThreshold: 5,
    imagePrompt: 'A small bronze participation trophy with a tiny salt shaker on top, pixel art style, retro gaming aesthetic',
    roastTemplate: 'Welcome to the leaderboard! Your dedication to mild annoyance has been noted.',
  },
  {
    id: 'serial_brigader',
    name: 'Serial Brigader',
    description: 'Achieved 10 salt points',
    tier: AchievementTier.SILVER,
    scoreThreshold: 10,
    imagePrompt: 'A silver badge with an angry keyboard warrior silhouette, dramatic lighting, gaming achievement style',
    roastTemplate: 'Double digits! Your commitment to being upset is truly inspiring.',
  },
  {
    id: 'professional_hater',
    name: 'Professional Hater',
    description: 'Achieved 25 salt points',
    tier: AchievementTier.GOLD,
    scoreThreshold: 25,
    imagePrompt: 'A gleaming gold medal with a rage face emoji, surrounded by salt crystals, epic gaming achievement',
    roastTemplate: 'At this point, you should put this on your resume. Professional-grade salt mining.',
  },
  {
    id: 'legendary_salt_lord',
    name: 'Legendary Salt Lord',
    description: 'Achieved 50 salt points',
    tier: AchievementTier.PLATINUM,
    scoreThreshold: 50,
    imagePrompt: 'A platinum crown made of crystallized salt, glowing with inner rage, legendary item style',
    roastTemplate: 'You have achieved Salt Enlightenment. The Dead Sea is jealous of your sodium levels.',
  },
  {
    id: 'transcendent_malcontent',
    name: 'Transcendent Malcontent',
    description: 'Achieved 100 salt points',
    tier: AchievementTier.DIAMOND,
    scoreThreshold: 100,
    imagePrompt: 'A diamond keyboard warrior statue ascending to the heavens, surrounded by pure crystalline rage, ultimate achievement',
    roastTemplate: 'You have transcended mere mortal hatred. Scientists wish to study your salt glands.',
  },

  // ===== RANK ACHIEVEMENTS =====
  {
    id: 'top_ten_menace',
    name: 'Top 10 Menace',
    description: 'Entered the top 10 haters',
    tier: AchievementTier.SILVER,
    rankThreshold: 10,
    imagePrompt: 'A "Top 10" billboard with a troll face, neon lights, leaderboard style',
    roastTemplate: 'You cracked the top 10! Your parents must be so proud.',
  },
  {
    id: 'podium_pest',
    name: 'Podium Pest',
    description: 'Reached top 3 on the leaderboard',
    tier: AchievementTier.GOLD,
    rankThreshold: 3,
    imagePrompt: 'A bronze/silver/gold podium with an angry gamer on top, victory pose, esports style',
    roastTemplate: 'Top 3! At this point you might as well go for gold. We believe in you.',
  },
  {
    id: 'supreme_antagonist',
    name: 'Supreme Antagonist',
    description: 'Became the #1 hater',
    tier: AchievementTier.DIAMOND,
    rankThreshold: 1,
    imagePrompt: 'A massive golden throne made of salt crystals, with "SUPREME HATER" engraved, boss battle style',
    roastTemplate: 'CONGRATULATIONS! You are now the #1 hater. The crown is heavy, but you carry it with such dedication.',
  },

  // ===== SPECIAL ACHIEVEMENTS =====
  {
    id: 'new_challenger',
    name: 'A New Challenger Appears!',
    description: 'First hostile link detected',
    tier: AchievementTier.BRONZE,
    special: 'first_offense',
    imagePrompt: 'A "NEW CHALLENGER" arcade screen with a silhouette entering, street fighter style',
    roastTemplate: 'Welcome! Your first contribution to our hater leaderboard has been recorded for posterity.',
  },
  {
    id: 'mask_off',
    name: 'Mask Off',
    description: 'Alt account linked to main',
    tier: AchievementTier.GOLD,
    special: 'alt_exposed',
    imagePrompt: 'A dramatic unmasking scene, Scooby-Doo reveal style, "It was YOU all along!"',
    roastTemplate: 'Your alt has been linked! The sockpuppet theater has been exposed. Standing ovation.',
  },
  {
    id: 'broken_record',
    name: 'Broken Record',
    description: 'Repeated the same talking point 3+ times',
    tier: AchievementTier.BRONZE,
    special: 'meme_repeater',
    imagePrompt: 'A cracked vinyl record with "ECHO CHAMBER" written on it, retro style',
    roastTemplate: 'We get it. You have opinions. The same ones. Over and over.',
  },
  {
    id: 'consistency_award',
    name: 'Consistency Award',
    description: 'Hostile links 5 days in a row',
    tier: AchievementTier.SILVER,
    special: 'streak',
    imagePrompt: 'A calendar with fire emojis on 5 consecutive days, streak counter style',
    roastTemplate: 'Five days straight! That kind of dedication usually goes to something productive.',
  },
];

// Achievement tier colors (for display)
export const TIER_COLORS: Record<AchievementTier, string> = {
  [AchievementTier.BRONZE]: '#CD7F32',
  [AchievementTier.SILVER]: '#C0C0C0',
  [AchievementTier.GOLD]: '#FFD700',
  [AchievementTier.PLATINUM]: '#E5E4E2',
  [AchievementTier.DIAMOND]: '#B9F2FF',
};

// Achievement tier emojis
export const TIER_EMOJIS: Record<AchievementTier, string> = {
  [AchievementTier.BRONZE]: '🥉',
  [AchievementTier.SILVER]: '🥈',
  [AchievementTier.GOLD]: '🥇',
  [AchievementTier.PLATINUM]: '💎',
  [AchievementTier.DIAMOND]: '👑',
};

const ACHIEVEMENTS_WIKI_PAGE = 'hub-bot-9000/user-achievements';
const ACHIEVEMENT_COOLDOWN_HOURS = 24;

/**
 * Get a user's achievement record
 */
export async function getUserAchievements(
  context: AppContext,
  username: string
): Promise<UserAchievements | null> {
  const key = `${REDIS_PREFIX.brigade}achievements:${username.toLowerCase()}`;
  return getJson<UserAchievements>(context.redis, key);
}

/**
 * Save a user's achievement record
 */
async function saveUserAchievements(
  context: AppContext,
  achievements: UserAchievements
): Promise<void> {
  const key = `${REDIS_PREFIX.brigade}achievements:${achievements.username.toLowerCase()}`;
  await setJson(context.redis, key, achievements, 365 * 24 * 60 * 60); // 1 year TTL
}

/**
 * Check for newly unlocked achievements based on user stats
 */
export async function checkAchievements(
  context: AppContext,
  username: string,
  userEntry: UserHaterEntry,
  leaderboardData: LeaderboardData,
  options?: {
    isFirstOffense?: boolean;
    isAltExposed?: boolean;
    repeatedMemes?: string[];
    consecutiveDays?: number;
    cooldownHours?: number;
  }
): Promise<AchievementUnlock[]> {
  const opts = options || {};
  const cooldownHours = opts.cooldownHours ?? ACHIEVEMENT_COOLDOWN_HOURS;

  // Get or create user achievements
  let userAchievements = await getUserAchievements(context, username);
  if (!userAchievements) {
    userAchievements = {
      username: username.toLowerCase(),
      unlockedAchievements: [],
      notifiedAchievements: [],
      lastAchievementAt: 0,
      lastNotificationAt: 0,
      totalAchievements: 0,
      highestTier: AchievementTier.BRONZE,
    };
  }

  // Calculate user's score and rank
  const score = userEntry.adversarialCount +
                (userEntry.hatefulCount * 3) +
                (userEntry.modLogSpamCount * 2) +
                ((userEntry.flaggedContentCount || 0) * 2);

  const userRank = leaderboardData.topUsers.findIndex(
    u => u.username.toLowerCase() === username.toLowerCase()
  ) + 1; // 1-indexed, 0 means not in top 10

  const unlocks: AchievementUnlock[] = [];

  // Check each achievement
  for (const achievement of ACHIEVEMENTS) {
    const alreadyUnlocked = userAchievements.unlockedAchievements.includes(achievement.id);
    const alreadyNotified = userAchievements.notifiedAchievements.includes(achievement.id);

    let meetsCondition = false;

    // Score threshold
    if (achievement.scoreThreshold && score >= achievement.scoreThreshold) {
      meetsCondition = true;
    }

    // Rank threshold
    if (achievement.rankThreshold && userRank > 0 && userRank <= achievement.rankThreshold) {
      meetsCondition = true;
    }

    // Special conditions
    if (achievement.special) {
      switch (achievement.special) {
        case 'first_offense':
          meetsCondition = opts.isFirstOffense === true;
          break;
        case 'alt_exposed':
          meetsCondition = opts.isAltExposed === true;
          break;
        case 'meme_repeater':
          meetsCondition = (opts.repeatedMemes?.length || 0) >= 3;
          break;
        case 'streak':
          meetsCondition = (opts.consecutiveDays || 0) >= 5;
          break;
      }
    }

    if (meetsCondition) {
      const isNew = !alreadyUnlocked;

      // Check cooldown for notifications
      const now = Date.now();
      const cooldownMs = cooldownHours * 60 * 60 * 1000;
      const canNotify = !alreadyNotified ||
                        (now - userAchievements.lastNotificationAt > cooldownMs);

      unlocks.push({
        achievement,
        isNew,
        shouldNotify: isNew && canNotify, // Only notify for new achievements, respecting cooldown
        leaderboardPosition: userRank || 999,
      });

      // Mark as unlocked
      if (isNew) {
        userAchievements.unlockedAchievements.push(achievement.id);
        userAchievements.lastAchievementAt = now;
        userAchievements.totalAchievements++;

        // Update highest tier
        if (getTierRank(achievement.tier) > getTierRank(userAchievements.highestTier)) {
          userAchievements.highestTier = achievement.tier;
        }
      }
    }
  }

  // Save if any changes
  if (unlocks.some(u => u.isNew)) {
    await saveUserAchievements(context, userAchievements);
  }

  return unlocks;
}

/**
 * Mark an achievement as notified (after posting comment)
 */
export async function markAchievementNotified(
  context: AppContext,
  username: string,
  achievementId: string
): Promise<void> {
  const achievements = await getUserAchievements(context, username);
  if (!achievements) return;

  if (!achievements.notifiedAchievements.includes(achievementId)) {
    achievements.notifiedAchievements.push(achievementId);
  }
  achievements.lastNotificationAt = Date.now();

  await saveUserAchievements(context, achievements);
}

/**
 * Get achievement by ID
 */
export function getAchievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find(a => a.id === id);
}

/**
 * Get all achievements for a tier
 */
export function getAchievementsByTier(tier: AchievementTier): Achievement[] {
  return ACHIEVEMENTS.filter(a => a.tier === tier);
}

/**
 * Get tier rank (for comparison)
 */
function getTierRank(tier: AchievementTier): number {
  const ranks: Record<AchievementTier, number> = {
    [AchievementTier.BRONZE]: 1,
    [AchievementTier.SILVER]: 2,
    [AchievementTier.GOLD]: 3,
    [AchievementTier.PLATINUM]: 4,
    [AchievementTier.DIAMOND]: 5,
  };
  return ranks[tier];
}

/**
 * Format achievement for display
 */
export function formatAchievementComment(
  achievement: Achievement,
  username: string,
  leaderboardPosition: number,
  totalScore: number,
  roastText: string,
  imageUrl?: string,
  wikiLinks?: Array<{ text: string; url: string }>
): string {
  const tierEmoji = TIER_EMOJIS[achievement.tier];
  const tierName = achievement.tier.toUpperCase();

  let comment = `## ${tierEmoji} ACHIEVEMENT UNLOCKED: ${achievement.name}

**${tierName} TIER**

${roastText}

---

**Current Stats:**
- Leaderboard Position: ${leaderboardPosition > 0 ? `#${leaderboardPosition}` : 'Unranked'}
- Total Salt Points: ${totalScore}
`;

  // Add image if provided (inline for subreddits that support it)
  if (imageUrl) {
    comment += `\n![${achievement.name}](${imageUrl})\n`;
  }

  // Add wiki links if provided
  if (wikiLinks && wikiLinks.length > 0) {
    comment += `\n**For your reference:**\n`;
    wikiLinks.forEach(link => {
      comment += `- [${link.text}](${link.url})\n`;
    });
  }

  comment += `\n---\n*brigade-sentinel | hater-leaderboard | ${achievement.id}*`;

  return comment;
}

/**
 * Get the highest unnotified achievement for a user
 * (To avoid spamming with multiple achievements at once)
 */
export function getHighestNewAchievement(unlocks: AchievementUnlock[]): AchievementUnlock | null {
  const notifiable = unlocks.filter(u => u.shouldNotify);
  if (notifiable.length === 0) return null;

  // Sort by tier rank (highest first)
  notifiable.sort((a, b) =>
    getTierRank(b.achievement.tier) - getTierRank(a.achievement.tier)
  );

  return notifiable[0];
}
