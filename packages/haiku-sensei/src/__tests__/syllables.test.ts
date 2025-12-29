import { describe, it, expect } from "vitest";
import { countSyllables, getWords } from "../syllables.js";

describe("syllables", () => {
  describe("countSyllables", () => {
    it("should count single syllable words", () => {
      expect(countSyllables("the")).toBe(1);
      expect(countSyllables("cat")).toBe(1);
      expect(countSyllables("dog")).toBe(1);
      expect(countSyllables("tree")).toBe(1);
    });

    it("should count two syllable words", () => {
      expect(countSyllables("hello")).toBe(2);
      expect(countSyllables("water")).toBe(2);
      expect(countSyllables("really")).toBe(2);
    });

    it("should count three syllable words", () => {
      expect(countSyllables("beautiful")).toBe(3);
      expect(countSyllables("different")).toBe(3);
      expect(countSyllables("probably")).toBe(3);
    });

    it("should handle silent e", () => {
      expect(countSyllables("make")).toBe(1);
      expect(countSyllables("home")).toBe(1);
      expect(countSyllables("life")).toBe(1);
    });

    it("should handle -ed endings", () => {
      expect(countSyllables("walked")).toBe(1);
      expect(countSyllables("wanted")).toBe(2);
      expect(countSyllables("created")).toBe(3);
    });

    it("should handle exceptions", () => {
      expect(countSyllables("fire")).toBe(2);
      expect(countSyllables("hour")).toBe(1);  // May vary by dialect
      expect(countSyllables("poem")).toBe(2);
    });

    it("should handle empty/invalid input", () => {
      expect(countSyllables("")).toBe(0);
      expect(countSyllables("123")).toBe(0);
    });
  });

  describe("getWords", () => {
    it("should split text into words", () => {
      expect(getWords("hello world")).toEqual(["hello", "world"]);
    });

    it("should handle punctuation", () => {
      expect(getWords("hello, world!")).toEqual(["hello", "world"]);
    });

    it("should handle multiple spaces", () => {
      expect(getWords("hello   world")).toEqual(["hello", "world"]);
    });

    it("should handle empty input", () => {
      expect(getWords("")).toEqual([]);
    });
  });
});
