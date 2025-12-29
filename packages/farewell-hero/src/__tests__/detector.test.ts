import { describe, it, expect } from "vitest";
import { detectUnsubscribePost, couldBeUnsubscribePost } from "../detector.js";

describe("farewell detector", () => {
  describe("detectUnsubscribePost", () => {
    it("should detect direct unsubscribe statements", () => {
      const result = detectUnsubscribePost("I'm unsubscribing from this subreddit");
      expect(result.isUnsubscribePost).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should detect dramatic farewells", () => {
      const result = detectUnsubscribePost("Goodbye everyone, this sub has gone to shit");
      expect(result.isUnsubscribePost).toBe(true);
    });

    it("should detect toxic complaints with leaving", () => {
      const result = detectUnsubscribePost("I'm done with this toxic echo chamber");
      expect(result.isUnsubscribePost).toBe(true);
    });

    it("should NOT detect questions about unsubscribing", () => {
      const result = detectUnsubscribePost("How do I unsubscribe from this subreddit?");
      expect(result.isUnsubscribePost).toBe(false);
    });

    it("should NOT detect posts about others leaving", () => {
      const result = detectUnsubscribePost("Why are people leaving this sub?");
      expect(result.isUnsubscribePost).toBe(false);
    });

    it("should NOT detect posts telling others not to leave", () => {
      const result = detectUnsubscribePost("Don't leave, this sub is great!");
      expect(result.isUnsubscribePost).toBe(false);
    });

    it("should have higher confidence for multiple patterns", () => {
      const single = detectUnsubscribePost("I'm leaving");
      const multiple = detectUnsubscribePost("I'm leaving this toxic echo chamber, goodbye everyone");
      expect(multiple.confidence).toBeGreaterThan(single.confidence);
    });
  });

  describe("couldBeUnsubscribePost", () => {
    it("should return true for posts with relevant keywords", () => {
      expect(couldBeUnsubscribePost("I'm unsubscribing")).toBe(true);
      expect(couldBeUnsubscribePost("Goodbye everyone")).toBe(true);
      expect(couldBeUnsubscribePost("This sub is toxic")).toBe(true);
    });

    it("should return false for unrelated posts", () => {
      expect(couldBeUnsubscribePost("What a beautiful sunset")).toBe(false);
      expect(couldBeUnsubscribePost("Check out this cool photo")).toBe(false);
    });
  });
});
