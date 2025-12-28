// Comment templates for brigade notifications

import { SourceClassification, getModFooter } from '@hub-bot/common';

interface TemplateParams {
  sourceSubreddit: string;
  sourceUrl: string;
  sourceTitle?: string;
  classification: SourceClassification;
  subreddit: string;
}

/**
 * Get the appropriate comment template based on source classification
 */
export function getBrigadeComment(params: TemplateParams): string {
  const { sourceSubreddit, sourceUrl, classification, subreddit } = params;

  let body: string;

  switch (classification) {
    case SourceClassification.FRIENDLY:
      body = `📬 **Crosspost Notice**

This thread has been shared in [r/${sourceSubreddit}](${sourceUrl}).`;
      break;

    case SourceClassification.ADVERSARIAL:
      body = `⚠️ **Crosspost Alert**

This thread has been linked from [r/${sourceSubreddit}](${sourceUrl}).

Visitors: please read our rules before participating.`;
      break;

    case SourceClassification.HATEFUL:
      body = `🚨 **Brigade Warning**

This thread has been linked from [r/${sourceSubreddit}](${sourceUrl}).

**r/${subreddit} members:** Report rule violations. Don't feed the trolls.

**Visitors:** Brigading violates [Reddit's Content Policy](https://www.redditinc.com/policies/content-policy).`;
      break;

    case SourceClassification.NEUTRAL:
    default:
      body = `📬 **Crosspost Notice**

This thread has been linked from [r/${sourceSubreddit}](${sourceUrl}).

Visitors: welcome! Please check the sidebar rules.`;
      break;
  }

  body += getModFooter();
  return body;
}

/**
 * Get modmail notification for mods
 */
export function getModmailBody(params: TemplateParams & {
  postTitle: string;
  postUrl: string;
  deletedCount?: number;
}): string {
  const {
    sourceSubreddit,
    sourceUrl,
    sourceTitle,
    classification,
    postTitle,
    postUrl,
    deletedCount,
  } = params;

  let body = `## Brigade Detection Alert

**Your post:** [${postTitle}](${postUrl})

**Linked from:** [r/${sourceSubreddit}](${sourceUrl})
${sourceTitle ? `**Source post title:** ${sourceTitle}` : ''}

**Classification:** ${classification.toUpperCase()}
`;

  if (deletedCount && deletedCount > 0) {
    body += `
**Deleted comments detected:** ${deletedCount}
Some comments from the source thread have been deleted. This may indicate coordinated activity.
`;
  }

  body += `
---
*This is an automated notification from brigade-sentinel.*
*[Manage settings](https://developers.reddit.com/apps/brigade-sentinel)*
`;

  return body;
}
