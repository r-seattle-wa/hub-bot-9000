import { Devvit } from '@devvit/public-api';
import { EventService } from '../services/eventService.js';
import { isValidUrl, isLinkAllowed, parseAllowedDomains, sanitizeUrl } from '../utils/linkValidator.js';

/**
 * Validate event form data with domain checking
 */
function validateEventForm(
  data: {
    title?: string;
    dateStart?: string;
    url?: string;
    description?: string;
  },
  allowedDomains?: string[]
): { valid: boolean; error?: string; sanitizedUrl?: string } {
  if (!data.title || data.title.trim().length === 0) {
    return { valid: false, error: 'Event title is required' };
  }
  if (data.title.length > 200) {
    return { valid: false, error: 'Title must be 200 characters or less' };
  }

  if (!data.dateStart) {
    return { valid: false, error: 'Event date is required' };
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(data.dateStart)) {
    return { valid: false, error: 'Date must be in YYYY-MM-DD format' };
  }

  if (!data.url) {
    return { valid: false, error: 'Event link is required' };
  }
  if (!isValidUrl(data.url)) {
    return { valid: false, error: 'Please enter a valid URL (https://)' };
  }

  // Check domain allowlist
  if (allowedDomains && !isLinkAllowed(data.url, allowedDomains)) {
    return {
      valid: false,
      error: 'URL domain not allowed. Use: eventbrite.com, meetup.com, facebook.com, or government sites'
    };
  }

  return { valid: true, sanitizedUrl: sanitizeUrl(data.url) };
}

/**
 * Submit Event Form - registered at module level
 */
export const submitEventForm = Devvit.createForm(
  {
    fields: [
      {
        name: 'title',
        label: 'Event Title',
        type: 'string',
        required: true,
      },
      {
        name: 'dateStart',
        label: 'Event Date (YYYY-MM-DD)',
        type: 'string',
        required: true,
      },
      {
        name: 'url',
        label: 'Event Link',
        type: 'string',
        required: true,
      },
      {
        name: 'description',
        label: 'Description (optional)',
        type: 'paragraph',
        required: false,
      },
    ],
    title: 'Submit a Community Event',
    acceptLabel: 'Submit',
    cancelLabel: 'Cancel',
  },
  async (event, context) => {
    const data = event.values;

    // Get allowed domains from settings
    const settings = await context.settings.getAll();
    const allowedDomainsStr = settings.allowedDomains as string || '';
    const allowedDomains = parseAllowedDomains(allowedDomainsStr);

    const validation = validateEventForm(
      {
        title: data.title as string,
        dateStart: data.dateStart as string,
        url: data.url as string,
        description: data.description as string,
      },
      allowedDomains
    );

    if (!validation.valid) {
      context.ui.showToast({ text: validation.error || 'Invalid form data', appearance: 'neutral' });
      return;
    }

    try {
      const currentUser = await context.reddit.getCurrentUser();
      const result = await EventService.addEvent(
        {
          title: data.title as string,
          description: (data.description as string) || '',
          url: validation.sanitizedUrl || data.url as string,
          dateStart: data.dateStart as string,
          dateEnd: data.dateStart as string,
          submittedBy: currentUser?.username || 'anonymous',
        },
        context,
        false
      );

      if (result.success) {
        context.ui.showToast({ text: 'Event submitted for mod review!', appearance: 'success' });
      } else {
        context.ui.showToast({ text: result.error || 'Failed to submit event', appearance: 'neutral' });
      }
    } catch (error) {
      console.error('Error submitting event:', error);
      context.ui.showToast({ text: 'Error submitting event', appearance: 'neutral' });
    }
  }
);
