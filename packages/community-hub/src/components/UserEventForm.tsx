import { Devvit } from '@devvit/public-api';
import { isValidUrl } from '../utils/linkValidator.js';

/**
 * Create the user event submission form
 * Note: This returns a form definition to be used with context.ui.showForm()
 */
export function createUserEventForm(
  onSubmit: (data: any) => Promise<void>
) {
  return Devvit.createForm(
    {
      fields: [
        {
          name: 'title',
          label: 'Event Title',
          type: 'string',
          required: true,
          helpText: 'What is the event called?',
        },
        {
          name: 'dateStart',
          label: 'Event Date',
          type: 'string',
          required: true,
          helpText: 'Format: YYYY-MM-DD (e.g., 2025-01-15)',
        },
        {
          name: 'url',
          label: 'Event Link',
          type: 'string',
          required: true,
          helpText: 'Link to event page (Eventbrite, Meetup, Facebook, etc.)',
        },
        {
          name: 'description',
          label: 'Description (optional)',
          type: 'paragraph',
          required: false,
          helpText: 'Brief description of the event (max 500 characters)',
        },
      ],
      title: 'Submit a Community Event',
      acceptLabel: 'Submit Event',
      cancelLabel: 'Cancel',
    },
    onSubmit
  );
}

/**
 * Validate event form data
 */
export function validateEventForm(data: {
  title?: string;
  dateStart?: string;
  url?: string;
  description?: string;
}): { valid: boolean; error?: string } {
  // Title validation
  if (!data.title || data.title.trim().length === 0) {
    return { valid: false, error: 'Event title is required' };
  }
  if (data.title.length > 200) {
    return { valid: false, error: 'Title must be 200 characters or less' };
  }

  // Date validation
  if (!data.dateStart) {
    return { valid: false, error: 'Event date is required' };
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(data.dateStart)) {
    return { valid: false, error: 'Date must be in YYYY-MM-DD format' };
  }
  const eventDate = new Date(data.dateStart);
  if (isNaN(eventDate.getTime())) {
    return { valid: false, error: 'Invalid date' };
  }
  if (eventDate < new Date()) {
    return { valid: false, error: 'Event date must be in the future' };
  }

  // URL validation
  if (!data.url) {
    return { valid: false, error: 'Event link is required' };
  }
  if (!isValidUrl(data.url)) {
    return { valid: false, error: 'Please enter a valid URL (must start with http:// or https://)' };
  }

  // Description validation
  if (data.description && data.description.length > 500) {
    return { valid: false, error: 'Description must be 500 characters or less' };
  }

  return { valid: true };
}

/**
 * Submit Event Button Component
 */
interface SubmitEventButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

export const SubmitEventButton = ({ onPress }: SubmitEventButtonProps): JSX.Element => {
  return (
    <hstack
      padding="medium"
      backgroundColor="#4da6ff"
      cornerRadius="medium"
      alignment="center middle"
      onPress={onPress}
    >
      <text size="medium" weight="bold" color="#0e0e1a">+ Submit Event</text>
    </hstack>
  );
};
