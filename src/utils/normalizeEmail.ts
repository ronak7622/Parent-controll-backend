/**
 * Canonical email normalization utility.
 *
 * Anti-abuse rules:
 * - Lowercases and trims all email addresses.
 * - For Gmail and Googlemail (which are interchangeable):
 *   1. Normalizes domain to 'gmail.com'.
 *   2. Removes all dots ('.') in the username/local-part (Google ignores dots: u.s.e.r@gmail.com === user@gmail.com).
 *   3. Strips all plus-addressing ('+...') (Google ignores suffixes: user+trial1@gmail.com === user@gmail.com).
 * - For other domains (Outlook, Yahoo, iCloud, custom):
 *   1. Lowercases domain and local-part.
 *   2. Strips plus-addressing if applicable.
 *
 * CRITICAL: Use the returned normalized email for ALL abuse, trial ledger,
 * rate limiting, and deduplication checks!
 */
export function normalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') return '';
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex === -1) return trimmed;

  let local = trimmed.substring(0, atIndex);
  let domain = trimmed.substring(atIndex + 1);

  // Normalize googlemail.com to gmail.com
  if (domain === 'googlemail.com') {
    domain = 'gmail.com';
  }

  // Strip plus-addressing (e.g. user+123 -> user)
  const plusIndex = local.indexOf('+');
  if (plusIndex !== -1) {
    local = local.substring(0, plusIndex);
  }

  // Remove dots for gmail.com
  if (domain === 'gmail.com') {
    local = local.replace(/\./g, '');
  }

  return `${local}@${domain}`;
}
