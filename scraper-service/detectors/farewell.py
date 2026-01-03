"""Farewell/unsubscribe detection - finds posts announcing departure from subreddit."""
import re
from dataclasses import dataclass
from typing import Optional, Literal

@dataclass
class FarewellResult:
    detected: bool
    confidence: float = 0.0
    matched_patterns: list[str] = None

    def __post_init__(self):
        if self.matched_patterns is None:
            self.matched_patterns = []


@dataclass
class PoliticalComplaintResult:
    detected: bool
    complaint_type: Optional[Literal['right-leaning', 'left-leaning', 'general']] = None
    matched_pattern: Optional[str] = None


# Patterns indicating someone is leaving/unsubscribing
UNSUBSCRIBE_PATTERNS = [
    # Direct statements
    re.compile(r"\b(i('m|am)|i('ve| have)) (unsubscrib(ed|ing)|leav(ing|e)|done with|quit(ting)?)\b", re.I),
    re.compile(r"\bunsubscribe[d]?\s+(from\s+)?(this|the) (sub|subreddit)\b", re.I),
    re.compile(r"\b(this|the) (sub|subreddit) (is|has) (gone|become|turned) (to\s+)?(shit|trash|garbage|toxic)", re.I),

    # Dramatic farewells
    re.compile(r"\b(goodbye|farewell|adios|so long|peace out),?\s*(r\/|this sub|everyone)", re.I),
    re.compile(r"\bused to (love|enjoy|like) this (sub|place|subreddit)\b", re.I),
    re.compile(r"\b(this|the) sub(reddit)? (used to be|was) (good|great|better)\b", re.I),

    # Leaving declarations
    re.compile(r"\b(i('m| am)|time to) (out|leaving|gone|outta here)\b", re.I),
    re.compile(r"\bthat's it,?\s*(i'm|i am) (done|out|leaving)\b", re.I),
    re.compile(r"\b(can't|cannot) (take|stand|handle) this (sub|subreddit) anymore\b", re.I),

    # Echo chamber / toxic complaints with leaving
    re.compile(r"\b(leaving|unsubbing|done)\b.*\b(toxic|echo.?chamber|circle.?jerk|hive.?mind)\b", re.I),
    re.compile(r"\b(toxic|echo.?chamber|circle.?jerk)\b.*\b(leaving|unsubbing|done)\b", re.I),
]

# Context keywords that increase confidence
CONTEXT_KEYWORDS = [
    'downhill',
    'used to be',
    'anymore',
    'toxic',
    'echo chamber',
    'circlejerk',
    'hivemind',
    'unsubscribed',
    'unsubscribing',
    'leaving',
    'goodbye',
    'farewell',
    'done with',
    'fed up',
    'last straw',
    'final straw',
]

# Negative patterns - indicates NOT an unsubscribe post
NEGATIVE_PATTERNS = [
    re.compile(r"\bhow (do|can) (i|you) unsubscribe\b", re.I),  # Asking how to unsubscribe
    re.compile(r"\b(should i|thinking about) (unsubscrib|leav)", re.I),  # Considering, not doing
    re.compile(r"\bdon't (leave|unsubscribe)\b", re.I),  # Telling others not to leave
    re.compile(r"\bwhy (did|are) (you|people) (leaving|unsubscribing)\b", re.I),  # Asking why others left
]

# Political complaint patterns
POLITICAL_COMPLAINT_PATTERNS = [
    re.compile(r"(this|the) (sub|subreddit) (is|has become|turned into) (a|an?)? ?(trump|maga|conservative|right.?wing|republican) (sub|subreddit|echo.?chamber)", re.I),
    re.compile(r"(this|the) (sub|subreddit) (is|has become|turned into) (a|an?)? ?(leftist|liberal|progressive|democrat) (sub|subreddit|echo.?chamber)", re.I),
    re.compile(r"trump (sub|subreddit)", re.I),
    re.compile(r"(echo.?chamber|circle.?jerk|hive.?mind).*(politics|political|partisan)", re.I),
    re.compile(r"(politics|political|partisan).*(echo.?chamber|circle.?jerk|hive.?mind)", re.I),
    re.compile(r"biased (towards?|against) (the )?(left|right|conservatives?|liberals?|republicans?|democrats?)", re.I),
    re.compile(r"all (you )?(people|guys|everyone) (here )?(are|vote) (the same|republican|democrat|trump|liberal)", re.I),
]

# Quick filter keywords
QUICK_FILTER_KEYWORDS = [
    'unsubscrib',
    'leaving',
    'leave',
    'goodbye',
    'farewell',
    'done with',
    'quit',
    'toxic',
    'echo chamber',
    'circlejerk',
    "i'm out",
    'im out',
]


def could_be_farewell(text: str) -> bool:
    """Quick pre-filter to avoid running regex on every post."""
    lower_text = text.lower()
    return any(kw in lower_text for kw in QUICK_FILTER_KEYWORDS)


def detect_farewell(text: str) -> FarewellResult:
    """Detect if text is an unsubscribe announcement."""
    # Check negative patterns first
    for pattern in NEGATIVE_PATTERNS:
        if pattern.search(text):
            return FarewellResult(detected=False)

    # Check main patterns
    matched_patterns = []
    for pattern in UNSUBSCRIBE_PATTERNS:
        if pattern.search(text):
            matched_patterns.append(pattern.pattern)

    if not matched_patterns:
        return FarewellResult(detected=False)

    # Calculate confidence
    confidence = min(0.5 + len(matched_patterns) * 0.15, 0.8)

    # Boost for context keywords
    lower_text = text.lower()
    context_matches = sum(1 for kw in CONTEXT_KEYWORDS if kw in lower_text)
    confidence += context_matches * 0.05

    # Cap at 0.95
    confidence = min(confidence, 0.95)

    return FarewellResult(
        detected=confidence >= 0.5,
        confidence=confidence,
        matched_patterns=matched_patterns,
    )


def detect_political_complaint(text: str) -> PoliticalComplaintResult:
    """Detect if text contains political/echo chamber complaints."""
    for pattern in POLITICAL_COMPLAINT_PATTERNS:
        if pattern.search(text):
            lower_text = text.lower()
            complaint_type: Literal['right-leaning', 'left-leaning', 'general'] = 'general'

            if re.search(r'trump|maga|conservative|right.?wing|republican', lower_text):
                complaint_type = 'right-leaning'  # They think the sub is right-leaning
            elif re.search(r'leftist|liberal|progressive|democrat', lower_text):
                complaint_type = 'left-leaning'  # They think the sub is left-leaning

            return PoliticalComplaintResult(
                detected=True,
                complaint_type=complaint_type,
                matched_pattern=pattern.pattern,
            )

    return PoliticalComplaintResult(detected=False)
