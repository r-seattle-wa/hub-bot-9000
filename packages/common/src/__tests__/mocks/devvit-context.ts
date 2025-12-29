// Mock Devvit context for testing
export interface MockRedis {
  data: Map<string, string>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, options?: { expiration?: Date }) => Promise<void>;
  del: (key: string) => Promise<void>;
}

export function createMockRedis(): MockRedis {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key: string) => data.get(key) ?? null,
    set: async (key: string, value: string) => { data.set(key, value); },
    del: async (key: string) => { data.delete(key); },
  };
}

export interface MockRedditAPI {
  users: Map<string, { username: string; linkKarma: number; commentKarma: number }>;
  subreddits: Map<string, { name: string }>;
  getUserByUsername: (username: string) => Promise<any>;
  getCurrentSubreddit: () => Promise<any>;
}

export function createMockRedditAPI(): MockRedditAPI {
  const users = new Map();
  const subreddits = new Map();
  subreddits.set("default", { name: "TestSubreddit" });
  
  return {
    users,
    subreddits,
    getUserByUsername: async (username: string) => users.get(username) ?? null,
    getCurrentSubreddit: async () => subreddits.get("default"),
  };
}

export interface MockContext {
  redis: MockRedis;
  reddit: MockRedditAPI;
}

export function createMockContext(): MockContext {
  return {
    redis: createMockRedis(),
    reddit: createMockRedditAPI(),
  };
}
