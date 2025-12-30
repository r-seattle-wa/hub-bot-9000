/**
 * Link validation utilities for user-submitted content
 */

// Default allowed domains for user-submitted event links
const DEFAULT_ALLOWED_DOMAINS = [
  'reddit.com',
  'redd.it',
  'eventbrite.com',
  'meetup.com',
  'facebook.com',
  'seattle.gov',
  'kingcounty.gov',
  'wa.gov',
];

/**
 * Parse allowed domains from settings string
 */
export function parseAllowedDomains(domainsString: string): string[] {
  if (!domainsString) return DEFAULT_ALLOWED_DOMAINS;

  return domainsString
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);
}

/**
 * Check if a URL is from an allowed domain
 */
export function isLinkAllowed(url: string, allowedDomains: string[] = DEFAULT_ALLOWED_DOMAINS): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Must be HTTPS
    if (parsed.protocol !== 'https:') {
      return false;
    }

    // Check against allowed domains
    return allowedDomains.some((domain) => {
      // Exact match or subdomain match
      return hostname === domain || hostname.endsWith(`.${domain}`);
    });
  } catch {
    return false;
  }
}

/**
 * Validate a URL format
 * Only allows https:// URLs for security
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow HTTPS - block javascript:, data:, file:, etc.
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Sanitize URL for display (remove tracking params, etc.)
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Remove common tracking parameters
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
    trackingParams.forEach((param) => parsed.searchParams.delete(param));

    return parsed.toString();
  } catch {
    return url;
  }
}
