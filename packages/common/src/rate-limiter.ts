// Rate limiting utilities for Devvit apps

import { Devvit } from '@devvit/public-api';
import { incrementCounter, REDIS_PREFIX } from './redis.js';
import type { RateLimitConfig } from './types.js';

/**
 * Default rate limits
 */
export const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  // Per-user limits
  userComment: { maxRequests: 1, windowSeconds: 3600 }, // 1 reply per user per hour
  userHaiku: { maxRequests: 3, windowSeconds: 86400 }, // 3 haiku detections per user per day
  userTribute: { maxRequests: 5, windowSeconds: 3600 }, // 5 tributes per user per hour

  // Per-subreddit limits
  subComment: { maxRequests: 50, windowSeconds: 86400 }, // 50 comments per sub per day
  subGemini: { maxRequests: 20, windowSeconds: 86400 }, // 20 AI calls per sub per day
  subPullpush: { maxRequests: 100, windowSeconds: 86400 }, // 100 pullpush queries per sub per day
  subTribute: { maxRequests: 30, windowSeconds: 86400 }, // 30 tributes per sub per day
};

/**
 * Check if action is rate limited
 * @returns true if action is allowed, false if rate limited
 */
export async function checkRateLimit(
  redis: Devvit.Context['redis'],
  limitType: string,
  identifier: string, // userId, subredditId, etc.
  config?: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const limit = config || DEFAULT_LIMITS[limitType];
  if (!limit) {
    return { allowed: true, remaining: Infinity, resetIn: 0 };
  }

  const key = `${REDIS_PREFIX.rateLimit}${limitType}:${identifier}`;
  const current = await redis.get(key);
  const count = parseInt(current || '0', 10) || 0;

  return {
    allowed: count < limit.maxRequests,
    remaining: Math.max(0, limit.maxRequests - count),
    resetIn: limit.windowSeconds,
  };
}

/**
 * Consume a rate limit token
 * Call this after successfully performing the rate-limited action
 */
export async function consumeRateLimit(
  redis: Devvit.Context['redis'],
  limitType: string,
  identifier: string,
  config?: RateLimitConfig
): Promise<number> {
  const limit = config || DEFAULT_LIMITS[limitType];
  if (!limit) return 0;

  const key = `${REDIS_PREFIX.rateLimit}${limitType}:${identifier}`;
  return await incrementCounter(redis, key, limit.windowSeconds);
}

// Opt-out functions moved to opt-out.ts (wiki-based storage for cross-app sharing)
