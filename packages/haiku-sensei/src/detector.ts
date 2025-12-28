// Haiku detection logic

import { countSyllables, getWords } from './syllables.js';

export interface HaikuResult {
  isHaiku: boolean;
  lines: [string, string, string] | null;
  syllables: [number, number, number] | null;
}

/**
 * Attempt to detect a haiku (5-7-5 syllable pattern) in text
 */
export function detectHaiku(text: string): HaikuResult {
  const words = getWords(text);

  // Need at least 3 words for a haiku
  if (words.length < 3) {
    return { isHaiku: false, lines: null, syllables: null };
  }

  // Try to find a valid 5-7-5 split
  const wordSyllables = words.map(w => countSyllables(w));
  const totalSyllables = wordSyllables.reduce((a, b) => a + b, 0);

  // Quick check: total should be 17
  if (totalSyllables !== 17) {
    return { isHaiku: false, lines: null, syllables: null };
  }

  // Try all possible splits
  for (let i = 1; i < words.length - 1; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const line1Syllables = wordSyllables.slice(0, i).reduce((a, b) => a + b, 0);
      const line2Syllables = wordSyllables.slice(i, j).reduce((a, b) => a + b, 0);
      const line3Syllables = wordSyllables.slice(j).reduce((a, b) => a + b, 0);

      if (line1Syllables === 5 && line2Syllables === 7 && line3Syllables === 5) {
        return {
          isHaiku: true,
          lines: [
            words.slice(0, i).join(' '),
            words.slice(i, j).join(' '),
            words.slice(j).join(' '),
          ],
          syllables: [5, 7, 5],
        };
      }
    }
  }

  return { isHaiku: false, lines: null, syllables: null };
}

/**
 * Format a haiku for display
 */
export function formatHaiku(lines: [string, string, string]): string {
  return `> *${lines[0]}*\n> *${lines[1]}*\n> *${lines[2]}*`;
}

/**
 * Check if text is too short or too long to be a haiku
 * Used for quick filtering before full detection
 */
export function couldBeHaiku(text: string): boolean {
  const words = getWords(text);
  // Haiku typically has 7-20 words
  return words.length >= 7 && words.length <= 20;
}
