import { describe, it, expect, beforeEach } from "vitest";
import { createMockRedis } from "./mocks/devvit-context.js";
import { checkRateLimit, consumeRateLimit, DEFAULT_LIMITS } from "../rate-limiter.js";

describe("rate-limiter", () => {
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    mockRedis = createMockRedis();
  });

  describe("checkRateLimit", () => {
    it("should allow first request", async () => {
      const result = await checkRateLimit(mockRedis as any, "userHaiku", "user123");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(DEFAULT_LIMITS.userHaiku.maxRequests);
    });

    it("should track consumed limits", async () => {
      await consumeRateLimit(mockRedis as any, "userHaiku", "user123");
      const result = await checkRateLimit(mockRedis as any, "userHaiku", "user123");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(DEFAULT_LIMITS.userHaiku.maxRequests - 1);
    });

    it("should deny when limit exhausted", async () => {
      const limit = DEFAULT_LIMITS.userHaiku.maxRequests;
      for (let i = 0; i < limit; i++) {
        await consumeRateLimit(mockRedis as any, "userHaiku", "user123");
      }
      const result = await checkRateLimit(mockRedis as any, "userHaiku", "user123");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe("consumeRateLimit", () => {
    it("should increment counter", async () => {
      await consumeRateLimit(mockRedis as any, "userHaiku", "user123");
      const key = "ratelimit:userHaiku:user123";
      const value = await mockRedis.get(key);
      expect(value).toBe("1");
    });

    it("should increment existing counter", async () => {
      await consumeRateLimit(mockRedis as any, "userHaiku", "user123");
      await consumeRateLimit(mockRedis as any, "userHaiku", "user123");
      const key = "ratelimit:userHaiku:user123";
      const value = await mockRedis.get(key);
      expect(value).toBe("2");
    });
  });
});
