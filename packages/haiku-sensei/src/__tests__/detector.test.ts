import { describe, it, expect } from "vitest";
import { detectHaiku, couldBeHaiku, formatHaiku } from "../detector.js";

describe("haiku detector", () => {
  describe("detectHaiku", () => {
    it("should detect a valid haiku", () => {
      // Classic example: 5-7-5
      const text = "An old silent pond A frog jumps into the pond Splash silence again";
      const result = detectHaiku(text);
      expect(result.isHaiku).toBe(true);
      expect(result.syllables).toEqual([5, 7, 5]);
    });

    it("should reject non-haiku text", () => {
      const text = "This is just a regular sentence with no particular pattern";
      const result = detectHaiku(text);
      expect(result.isHaiku).toBe(false);
      expect(result.lines).toBe(null);
    });

    it("should reject text with wrong syllable count", () => {
      const text = "One two three four five six seven eight nine ten";
      const result = detectHaiku(text);
      expect(result.isHaiku).toBe(false);
    });

    it("should reject text with too few words", () => {
      const text = "Hi there";
      const result = detectHaiku(text);
      expect(result.isHaiku).toBe(false);
    });
  });

  describe("couldBeHaiku", () => {
    it("should return true for text in syllable range", () => {
      expect(couldBeHaiku("This has about seventeen syllables in total here")).toBe(true);
    });

    it("should return false for very short text", () => {
      expect(couldBeHaiku("Hi")).toBe(false);
    });

    it("should return false for very long text", () => {
      const longText = "word ".repeat(100);
      expect(couldBeHaiku(longText)).toBe(false);
    });
  });

  describe("formatHaiku", () => {
    it("should format haiku lines with slashes", () => {
      const lines: [string, string, string] = ["line one here", "line two is longer", "line three end"];
      const formatted = formatHaiku(lines);
      expect(formatted).toContain("line one here");
      expect(formatted).toContain("line two is longer");
      expect(formatted).toContain("line three end");
    });
  });
});
