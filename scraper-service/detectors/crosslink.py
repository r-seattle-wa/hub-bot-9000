"""Crosslink detection - finds Reddit links in text."""
import re
from dataclasses import dataclass
from typing import Optional

@dataclass
class CrosslinkMatch:
    subreddit: str
    full_url: str
    post_id: Optional[str] = None
    comment_id: Optional[str] = None


@dataclass
class CrosslinkResult:
    detected: bool
    links: list[CrosslinkMatch] = None

    def __post_init__(self):
        if self.links is None:
            self.links = []


# Reddit URL patterns
REDDIT_LINK_PATTERNS = [
    # Full URLs: https://reddit.com/r/subreddit/comments/id/title
    re.compile(r'https?://(?:www\.)?(?:old\.)?reddit\.com/r/([a-zA-Z0-9_]+)(?:/comments/([a-z0-9]+))?(?:/[^/\s]*)?(?:/([a-z0-9]+))?', re.I),
    # Short URLs: https://redd.it/id
    re.compile(r'https?://redd\.it/([a-z0-9]+)', re.I),
    # Subreddit mentions: r/subreddit
    re.compile(r'(?<![/\w])r/([a-zA-Z0-9_]{2,21})(?![/\w])', re.I),
]


def detect_crosslinks(text: str, exclude_subreddit: Optional[str] = None) -> CrosslinkResult:
    """
    Detect Reddit links in text.

    Args:
        text: Text to search
        exclude_subreddit: Subreddit to exclude (e.g., the source subreddit)
    """
    links = []
    seen_urls = set()

    # Full Reddit URLs
    for match in REDDIT_LINK_PATTERNS[0].finditer(text):
        subreddit = match.group(1)
        post_id = match.group(2) if match.lastindex >= 2 else None
        comment_id = match.group(3) if match.lastindex >= 3 else None
        full_url = match.group(0)

        if exclude_subreddit and subreddit.lower() == exclude_subreddit.lower():
            continue

        if full_url not in seen_urls:
            seen_urls.add(full_url)
            links.append(CrosslinkMatch(
                subreddit=subreddit,
                full_url=full_url,
                post_id=post_id,
                comment_id=comment_id,
            ))

    # Short URLs (redd.it)
    for match in REDDIT_LINK_PATTERNS[1].finditer(text):
        post_id = match.group(1)
        full_url = match.group(0)

        if full_url not in seen_urls:
            seen_urls.add(full_url)
            links.append(CrosslinkMatch(
                subreddit='unknown',  # Can't determine from short URL
                full_url=full_url,
                post_id=post_id,
            ))

    # Subreddit mentions (r/subreddit)
    for match in REDDIT_LINK_PATTERNS[2].finditer(text):
        subreddit = match.group(1)
        full_url = f"https://reddit.com/r/{subreddit}"

        if exclude_subreddit and subreddit.lower() == exclude_subreddit.lower():
            continue

        # Don't duplicate if we already have a full URL for this subreddit
        if full_url not in seen_urls and not any(l.subreddit.lower() == subreddit.lower() for l in links):
            seen_urls.add(full_url)
            links.append(CrosslinkMatch(
                subreddit=subreddit,
                full_url=full_url,
            ))

    return CrosslinkResult(
        detected=len(links) > 0,
        links=links,
    )


def get_external_subreddit_links(text: str, source_subreddit: str) -> list[CrosslinkMatch]:
    """Get links to subreddits other than the source."""
    result = detect_crosslinks(text, exclude_subreddit=source_subreddit)
    return result.links
