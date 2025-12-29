// URL extraction utilities for hub-bot-9000
// Used by brigade-sentinel to detect outgoing links to other subreddits

export interface RedditLink {
  subreddit: string;
  fullUrl: string | null;
  postId?: string;
  commentId?: string;
}

/**
 * Extract Reddit links from text
 * Matches both full URLs and r/subreddit shorthand
 */
export function extractRedditLinks(text: string): RedditLink[] {
  const links: RedditLink[] = [];
  const seenSubreddits = new Set<string>();

  // Pattern 1: Full Reddit URLs
  // Matches: https://reddit.com/r/subreddit, www.reddit.com/r/subreddit, old.reddit.com/r/subreddit
  const fullUrlPattern = /(?:https?:\/\/)?(?:www\.|old\.|new\.)?reddit\.com\/r\/(\w+)(?:\/comments\/(\w+))?(?:\/[^\/]*\/(\w+))?/gi;
  let match: RegExpExecArray | null;

  while ((match = fullUrlPattern.exec(text)) !== null) {
    const subreddit = match[1].toLowerCase();
    if (!seenSubreddits.has(subreddit)) {
      seenSubreddits.add(subreddit);
      links.push({
        subreddit,
        fullUrl: match[0],
        postId: match[2] || undefined,
        commentId: match[3] || undefined,
      });
    }
  }

  // Pattern 2: r/subreddit shorthand (not already captured by full URL)
  // Must be at word boundary to avoid matching in the middle of URLs
  const shorthandPattern = /(?:^|[\s\(\[\{<])r\/(\w+)/gi;

  while ((match = shorthandPattern.exec(text)) !== null) {
    const subreddit = match[1].toLowerCase();
    if (!seenSubreddits.has(subreddit)) {
      seenSubreddits.add(subreddit);
      links.push({
        subreddit,
        fullUrl: null,
      });
    }
  }

  return links;
}

/**
 * Check if text contains any Reddit links
 */
export function containsRedditLinks(text: string): boolean {
  return extractRedditLinks(text).length > 0;
}

/**
 * Get unique subreddits mentioned in text
 */
export function getLinkedSubreddits(text: string): string[] {
  return extractRedditLinks(text).map(link => link.subreddit);
}

/**
 * Filter out same-subreddit links (self-references)
 */
export function getExternalSubredditLinks(
  text: string,
  currentSubreddit: string
): RedditLink[] {
  const normalizedCurrent = currentSubreddit.toLowerCase();
  return extractRedditLinks(text).filter(
    link => link.subreddit !== normalizedCurrent
  );
}
