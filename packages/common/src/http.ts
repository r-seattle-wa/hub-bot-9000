// HTTP fetch utilities with rate limiting for external API calls

import { Devvit } from '@devvit/public-api';

const USER_AGENT = 'hub-bot-9000/0.0.1 (Devvit Reddit app)';

// Simple in-memory rate limiter for external APIs
const rateLimitState: Record<string, { lastCall: number; count: number }> = {};

interface RateLimitConfig {
  requestsPerMinute: number;
  retryDelayMs?: number;
  maxRetries?: number;
}

const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  'api.pullpush.io': { requestsPerMinute: 30, retryDelayMs: 2000, maxRetries: 3 },
  'default': { requestsPerMinute: 60, retryDelayMs: 1000, maxRetries: 2 },
};

/**
 * Check if we can make a request to a domain
 */
function canMakeRequest(domain: string): boolean {
  const config = DEFAULT_RATE_LIMITS[domain] || DEFAULT_RATE_LIMITS['default'];
  const now = Date.now();
  const state = rateLimitState[domain];

  if (!state) {
    rateLimitState[domain] = { lastCall: now, count: 1 };
    return true;
  }

  // Reset counter every minute
  if (now - state.lastCall > 60000) {
    rateLimitState[domain] = { lastCall: now, count: 1 };
    return true;
  }

  if (state.count >= config.requestsPerMinute) {
    return false;
  }

  state.count++;
  state.lastCall = now;
  return true;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract domain from URL
 */
function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'default';
  }
}

export interface FetchOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export interface FetchResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

/**
 * Rate-limited fetch wrapper for external APIs
 */
export async function rateLimitedFetch<T>(
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult<T>> {
  const domain = getDomain(url);
  const config = DEFAULT_RATE_LIMITS[domain] || DEFAULT_RATE_LIMITS['default'];

  // Check rate limit
  if (!canMakeRequest(domain)) {
    return {
      ok: false,
      status: 429,
      error: `Rate limit exceeded for ${domain}`,
    };
  }

  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
    ...options.headers,
  };

  let lastError: string | undefined;

  for (let attempt = 0; attempt < (config.maxRetries || 2); attempt++) {
    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body,
      });

      if (response.ok) {
        const data = await response.json() as T;
        return { ok: true, status: response.status, data };
      }

      // Handle rate limiting from server
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : (config.retryDelayMs || 2000);
        await sleep(delay);
        continue;
      }

      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      await sleep(config.retryDelayMs || 1000);
    }
  }

  return {
    ok: false,
    status: 0,
    error: lastError || 'Max retries exceeded',
  };
}

/**
 * Simple fetch without rate limiting (for one-off requests)
 */
export async function simpleFetch<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}
