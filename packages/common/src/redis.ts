// Redis helper utilities for Devvit apps

import { Devvit } from '@devvit/public-api';

/**
 * Get JSON value from Redis with type safety
 */
export async function getJson<T>(
  redis: Devvit.Context['redis'],
  key: string
): Promise<T | null> {
  const value = await redis.get(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Set JSON value in Redis with optional TTL
 */
export async function setJson<T>(
  redis: Devvit.Context['redis'],
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<void> {
  const json = JSON.stringify(value);
  if (ttlSeconds) {
    await redis.set(key, json, { expiration: new Date(Date.now() + ttlSeconds * 1000) });
  } else {
    await redis.set(key, json);
  }
}

/**
 * Increment a counter with optional TTL (for rate limiting)
 */
export async function incrementCounter(
  redis: Devvit.Context['redis'],
  key: string,
  ttlSeconds: number
): Promise<number> {
  const current = await redis.get(key);
  const newValue = (parseInt(current || '0', 10) || 0) + 1;
  await redis.set(key, String(newValue), {
    expiration: new Date(Date.now() + ttlSeconds * 1000),
  });
  return newValue;
}

/**
 * Check if a key exists
 */
export async function exists(
  redis: Devvit.Context['redis'],
  key: string
): Promise<boolean> {
  const value = await redis.get(key);
  return value !== null && value !== undefined;
}

/**
 * Redis key prefixes for each app
 */
export const REDIS_PREFIX = {
  haiku: 'haiku:',
  brigade: 'brigade:',
  farewell: 'farewell:',
  classification: 'classification:',
  rateLimit: 'ratelimit:',
} as const;
