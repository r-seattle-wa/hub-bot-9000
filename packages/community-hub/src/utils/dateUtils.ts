/**
 * Date and time utilities
 */

/**
 * Format date for display
 */
export function formatDate(date: Date, format: 'short' | 'long' | 'iso' = 'long'): string {
  switch (format) {
    case 'short':
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    case 'long':
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    case 'iso':
      return date.toISOString().split('T')[0];
    default:
      return date.toLocaleDateString();
  }
}

/**
 * Get day of week name
 */
export function getDayOfWeek(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

/**
 * Parse time string (HH:MM) to hours and minutes
 */
export function parseTime(timeString: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeString.split(':').map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}

/**
 * Convert time string to cron hour/minute
 */
export function timeToCron(timeString: string): string {
  const { hours, minutes } = parseTime(timeString);
  return `${minutes} ${hours}`;
}

/**
 * Get start of week date
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Format week range for display
 */
export function formatWeekRange(date: Date): string {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `${startStr} - ${endStr}`;
}
