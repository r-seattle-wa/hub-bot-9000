// Syllable counting for haiku detection

/**
 * Count syllables in a word using a heuristic approach
 * This is approximate but works well for English
 */
export function countSyllables(word: string): number {
  word = word.toLowerCase().trim();

  // Handle empty or non-word input
  if (!word || !/[a-z]/.test(word)) return 0;

  // Common exceptions
  const exceptions: Record<string, number> = {
    'the': 1,
    'every': 3,
    'everything': 4,
    'beautiful': 3,
    'different': 3,
    'interesting': 4,
    'probably': 3,
    'actually': 4,
    'basically': 4,
    'literally': 4,
    'obviously': 4,
    'usually': 4,
    'created': 3,
    'really': 2,
    'area': 3,
    'idea': 3,
    'poem': 2,
    'poet': 2,
    'being': 2,
    'seeing': 2,
    'doing': 2,
    'going': 2,
    'hours': 2,
    'hour': 1,
    'our': 1,
    'fire': 2,
    'hire': 2,
    'tired': 2,
    'wired': 2,
    'higher': 2,
    'lion': 2,
    'quiet': 2,
    'diet': 2,
    'riot': 2,
    'science': 2,
    'violence': 3,
  };

  if (exceptions[word] !== undefined) {
    return exceptions[word];
  }

  // Remove non-letters
  word = word.replace(/[^a-z]/g, '');
  if (word.length === 0) return 0;
  if (word.length <= 2) return 1;

  // Count vowel groups
  let count = 0;
  let prevVowel = false;
  const vowels = 'aeiouy';

  for (let i = 0; i < word.length; i++) {
    const isVowel = vowels.includes(word[i]);
    if (isVowel && !prevVowel) {
      count++;
    }
    prevVowel = isVowel;
  }

  // Adjustments
  // Silent e at end
  if (word.endsWith('e') && !word.endsWith('le') && count > 1) {
    count--;
  }

  // -le at end adds syllable if preceded by consonant
  if (word.endsWith('le') && word.length > 2 && !vowels.includes(word[word.length - 3])) {
    // Already counted, no adjustment needed
  }

  // -ed endings
  if (word.endsWith('ed') && word.length > 2) {
    const beforeEd = word[word.length - 3];
    if (beforeEd !== 't' && beforeEd !== 'd') {
      count--;
    }
  }

  // Ensure at least 1 syllable
  return Math.max(1, count);
}

/**
 * Count total syllables in a text
 */
export function countTextSyllables(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  return words.reduce((sum, word) => sum + countSyllables(word), 0);
}

/**
 * Split text into words, preserving structure
 */
export function getWords(text: string): string[] {
  return text
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0 && /[a-zA-Z]/.test(w));
}
