import { TriggerContext, JobContext } from '@devvit/public-api';

type AppContext = TriggerContext | JobContext;

const MAX_POSTS = 25;
const MAX_COMMENTS_PER_POST = 3;
const MAX_POST_BODY_LENGTH = 500;
const MAX_COMMENT_LENGTH = 300;

/**
 * Fetch context from a subreddit for tribute generation
 */
export async function fetchSubredditContext(
  context: AppContext,
  subredditName: string,
  limit: number = MAX_POSTS
): Promise<string> {
  try {
    const posts = await context.reddit.getHotPosts({
      subredditName,
      limit,
    }).all();

    const contextParts: string[] = [];

    for (const post of posts.slice(0, 15)) {
      let postText = `Title: ${post.title}`;

      if (post.body && post.body.length > 0 && post.body.length < MAX_POST_BODY_LENGTH) {
        postText += `\nBody: ${post.body.slice(0, MAX_POST_BODY_LENGTH)}`;
      }

      try {
        const comments = await context.reddit.getComments({
          postId: post.id,
          limit: MAX_COMMENTS_PER_POST,
          sort: 'top',
        }).all();

        const topComments = comments
          .filter(c => c.body && c.body.length < MAX_COMMENT_LENGTH && c.body !== '[deleted]')
          .slice(0, 2)
          .map(c => c.body);

        if (topComments.length > 0) {
          postText += `\nTop comments: ${topComments.join(' | ')}`;
        }
      } catch {
        // Skip comments if we can't fetch them
      }

      contextParts.push(postText);
    }

    if (contextParts.length === 0) {
      throw new Error(`No content found for r/${subredditName}`);
    }

    return contextParts.join('\n\n---\n\n');
  } catch (error) {
    console.error(`Error fetching subreddit context for r/${subredditName}:`, error);
    throw error;
  }
}

/**
 * Fetch context from a user's post history for tribute generation
 */
export async function fetchUserContext(
  context: AppContext,
  username: string,
  commentLimit: number = 30,
  postLimit: number = 10
): Promise<string> {
  const contentParts: string[] = [];

  try {
    const comments = await context.reddit.getCommentsByUser({
      username,
      limit: commentLimit,
      sort: 'new',
    }).all();

    for (const comment of comments) {
      if (comment.body && comment.body.length > 0 && comment.body !== '[deleted]') {
        const text = `[r/${comment.subredditName}] ${comment.body.slice(0, 300)}`;
        contentParts.push(text);
      }
    }
  } catch (error) {
    console.error(`Error fetching comments for u/${username}:`, error);
  }

  try {
    const posts = await context.reddit.getPostsByUser({
      username,
      limit: postLimit,
      sort: 'new',
    }).all();

    for (const post of posts) {
      let text = `[r/${post.subredditName}] Title: ${post.title}`;
      if (post.body && post.body.length > 0) {
        text += ` - ${post.body.slice(0, 200)}`;
      }
      contentParts.push(text);
    }
  } catch (error) {
    console.error(`Error fetching posts for u/${username}:`, error);
  }

  if (contentParts.length === 0) {
    throw new Error(`No content found for u/${username}`);
  }

  return contentParts.slice(0, 20).join('\n\n');
}
