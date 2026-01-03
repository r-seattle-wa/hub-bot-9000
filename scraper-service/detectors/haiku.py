"""Haiku detection - finds 5-7-5 syllable patterns in text."""
import re
from dataclasses import dataclass
from typing import Optional

@dataclass
class HaikuResult:
    detected: bool
    lines: Optional[list[str]] = None  # [line1, line2, line3]
    syllables: Optional[list[int]] = None  # [5, 7, 5]


# Common exceptions for syllable counting
SYLLABLE_EXCEPTIONS = {
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
    'seattle': 3,
    'people': 2,
    'little': 2,
    'middle': 2,
    'purple': 2,
    'simple': 2,
    'temple': 2,
    'able': 2,
    'table': 2,
    'cable': 2,
    'fable': 2,
}


def count_syllables(word: str) -> int:
    """Count syllables in a word using heuristics."""
    word = word.lower().strip()

    # Handle empty or non-word input
    if not word or not re.search(r'[a-z]', word):
        return 0

    # Check exceptions
    if word in SYLLABLE_EXCEPTIONS:
        return SYLLABLE_EXCEPTIONS[word]

    # Remove non-letters
    word = re.sub(r'[^a-z]', '', word)
    if not word:
        return 0
    if len(word) <= 2:
        return 1

    # Count vowel groups
    count = 0
    prev_vowel = False
    vowels = 'aeiouy'

    for char in word:
        is_vowel = char in vowels
        if is_vowel and not prev_vowel:
            count += 1
        prev_vowel = is_vowel

    # Adjustments
    # Silent e at end
    if word.endswith('e') and not word.endswith('le') and count > 1:
        count -= 1

    # -ed endings (not after t or d)
    if word.endswith('ed') and len(word) > 2:
        before_ed = word[-3]
        if before_ed not in ('t', 'd'):
            count -= 1

    return max(1, count)


def get_words(text: str) -> list[str]:
    """Split text into words."""
    # Replace punctuation with spaces, keep hyphens and apostrophes
    text = re.sub(r"[^\w\s'-]", ' ', text)
    words = text.split()
    # Filter to words with letters
    return [w for w in words if w and re.search(r'[a-zA-Z]', w)]


def detect_haiku(text: str) -> HaikuResult:
    """Attempt to detect a haiku (5-7-5 syllable pattern) in text."""
    words = get_words(text)

    # Need at least 3 words for a haiku
    if len(words) < 3:
        return HaikuResult(detected=False)

    # Quick filter: haiku typically has 7-20 words
    if len(words) < 7 or len(words) > 25:
        return HaikuResult(detected=False)

    # Get syllable count for each word
    word_syllables = [count_syllables(w) for w in words]
    total_syllables = sum(word_syllables)

    # Quick check: total should be 17
    if total_syllables != 17:
        return HaikuResult(detected=False)

    # Try all possible splits to find 5-7-5
    for i in range(1, len(words) - 1):
        for j in range(i + 1, len(words)):
            line1_syllables = sum(word_syllables[:i])
            line2_syllables = sum(word_syllables[i:j])
            line3_syllables = sum(word_syllables[j:])

            if line1_syllables == 5 and line2_syllables == 7 and line3_syllables == 5:
                return HaikuResult(
                    detected=True,
                    lines=[
                        ' '.join(words[:i]),
                        ' '.join(words[i:j]),
                        ' '.join(words[j:]),
                    ],
                    syllables=[5, 7, 5],
                )

    return HaikuResult(detected=False)


def format_haiku(lines: list[str]) -> str:
    """Format a haiku for display."""
    return f"> *{lines[0]}*\n> *{lines[1]}*\n> *{lines[2]}*"
