/**
 * Comprehensive list of disposable/temporary email provider domains.
 * Reject signups and trial activation from these domains to prevent fraud/abuse.
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  'guerrillamail.com',
  'guerrillamailblock.com',
  'sharklasers.com',
  'grr.la',
  'guerrillamail.biz',
  'guerrillamail.de',
  'guerrillamail.net',
  'guerrillamail.org',
  '10minutemail.com',
  '10minutemail.net',
  '10minutemail.org',
  'throwawaymail.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'cool.fr.nf',
  'jetable.fr.nf',
  'dispostable.com',
  'fakeinbox.com',
  'generator.email',
  'mohmal.com',
  'trashmail.com',
  'trashmail.net',
  'trashmail.me',
  'getairmail.com',
  'crazymailing.com',
  'mytemp.email',
  'nada.ltd',
  'dropmail.me',
  'fakemailgenerator.com',
  'emailondeck.com',
  'burnermail.io',
  'inboxkitten.com',
  'tempinbox.com',
  'tempail.com',
  'tmail.com',
  'disposablemail.com',
  'trash-mail.com',
  'minuteinbox.com',
  'getnada.com',
  'abcvg.com',
  'boximail.com',
  'maildrop.cc',
  'mailcatch.com',
  'armyspy.com',
  'cuvox.de',
  'dayrep.com',
  'fleckens.hu',
  'gustr.com',
  'jourrapide.com',
  'rhyta.com',
  'superrito.com',
  'teleworm.us',
  'tinagr.com',
  'zoemail.org',
  'fastmail.fm',
  'inboxbear.com',
  'getmule.com',
  'tempmailo.com',
  'tmpmail.net',
  'tmpmail.org',
  'guerrillamail.info',
]);

/**
 * Checks whether an email address is from a known disposable / temporary mail domain.
 */
export function isDisposableEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const parts = email.trim().toLowerCase().split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1].trim();
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return true;

  // Check second-level subdomains, e.g. "sub.mailinator.com"
  const domainParts = domain.split('.');
  if (domainParts.length > 2) {
    const parentDomain = domainParts.slice(-2).join('.');
    if (DISPOSABLE_EMAIL_DOMAINS.has(parentDomain)) return true;
  }
  return false;
}
