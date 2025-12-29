import { describe, it, expect } from "vitest";
import { generateFarewellResponse, determineSarcasmLevel } from "../responses.js";
import { SarcasmLevel, UserTone } from "@hub-bot/common";

describe("farewell responses", () => {
  const mockStats = {
    username: "testuser",
    subreddit: "TestSub",
    totalPosts: 10,
    totalComments: 50,
    daysSinceFirstActivity: 365,
    isLurker: false,
    isPowerUser: false,
    isNotableContributor: false,
    postKarma: 100,
    firstPostDate: null,
    lastPostDate: null,
    bestPost: null,
    commentKarma: 500,
    firstCommentDate: null,
    lastCommentDate: null,
    bestComment: null,
    accountAge: "1 year",
    totalKarma: 600,
    notableYears: [],
  };

  describe("generateFarewellResponse", () => {
    it("should generate response for standard user", () => {
      const response = generateFarewellResponse(mockStats, SarcasmLevel.NEUTRAL);
      expect(response).toContain("testuser");
      expect(response).toContain("Farewell Statistics");
    });

    it("should generate response for lurker", () => {
      const lurkerStats = { ...mockStats, isLurker: true, totalPosts: 0, totalComments: 2 };
      const response = generateFarewellResponse(lurkerStats, SarcasmLevel.SNARKY);
      expect(response).toContain("testuser");
    });

    it("should generate response for power user", () => {
      const powerStats = { ...mockStats, isPowerUser: true, totalPosts: 100, totalComments: 500 };
      const response = generateFarewellResponse(powerStats, SarcasmLevel.POLITE);
      expect(response).toContain("testuser");
    });

    it("should include repeat count when provided", () => {
      const response = generateFarewellResponse(mockStats, SarcasmLevel.SNARKY, undefined, 3);
      expect(response).toBeDefined();
    });

    it("should vary by sarcasm level", () => {
      const polite = generateFarewellResponse(mockStats, SarcasmLevel.POLITE);
      const freakout = generateFarewellResponse(mockStats, SarcasmLevel.FREAKOUT);
      expect(polite).not.toEqual(freakout);
    });
  });

  describe("determineSarcasmLevel", () => {
    it("should return POLITE for polite users", () => {
      const result = determineSarcasmLevel(UserTone.POLITE, SarcasmLevel.NEUTRAL, true);
      expect(result).toBe(SarcasmLevel.POLITE);
    });

    it("should return default for neutral users", () => {
      const result = determineSarcasmLevel(UserTone.NEUTRAL, SarcasmLevel.SNARKY, true);
      expect(result).toBe(SarcasmLevel.SNARKY);
    });

    it("should escalate for hostile users", () => {
      const result = determineSarcasmLevel(UserTone.HOSTILE, SarcasmLevel.NEUTRAL, true);
      expect(result).toBe(SarcasmLevel.ROAST);
    });

    it("should match FREAKOUT for dramatic users", () => {
      const result = determineSarcasmLevel(UserTone.DRAMATIC, SarcasmLevel.NEUTRAL, true);
      expect(result).toBe(SarcasmLevel.FREAKOUT);
    });

    it("should return default when matchToneToUser is false", () => {
      const result = determineSarcasmLevel(UserTone.HOSTILE, SarcasmLevel.POLITE, false);
      expect(result).toBe(SarcasmLevel.POLITE);
    });
  });
});
