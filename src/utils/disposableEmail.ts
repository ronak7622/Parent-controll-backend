import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';

// Configure high-reliability DNS resolvers for MX checking
try {
  const dnsSync = require('node:dns');
  dnsSync.setServers(['8.8.8.8', '1.1.1.1', '9.9.9.9']);
} catch {
  // fallback to system default
}

let cachedSet: Set<string> | null = null;

function loadDisposableDomains(): Set<string> {
  if (cachedSet) return cachedSet;
  try {
    const filePath = path.join(__dirname, '..', 'data', 'disposable-domains.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const arr = JSON.parse(raw);
      cachedSet = new Set(arr.map((d: string) => d.toLowerCase().trim()));
      return cachedSet;
    }
  } catch (err) {
    console.error('[DISPOSABLE-EMAIL] Failed to load disposable-domains.json:', err);
  }

  // Fallback initial list
  cachedSet = new Set<string>([
    'boffweb.com',
    'ooynib.com',
    'mailinator.com',
    'tempmail.com',
    'temp-mail.org',
    'temp-mail.io',
    'temp-mail.com',
    'tempmailo.com',
    'tmpmail.net',
    'tmpmail.org',
    'guerrillamail.com',
    'guerrillamailblock.com',
    'guerrillamail.biz',
    'guerrillamail.de',
    'guerrillamail.net',
    'guerrillamail.org',
    'guerrillamail.info',
    'sharklasers.com',
    'grr.la',
    '10minutemail.com',
    '10minutemail.net',
    '10minutemail.org',
    'throwawaymail.com',
    'yopmail.com',
    'mohmal.com',
    'trashmail.com',
    'burnermail.io',
  ]);
  return cachedSet;
}

const DISPOSABLE_PATTERNS = [
  /temp.*mail/i,
  /trash.*mail/i,
  /fake.*mail/i,
  /disposa/i,
  /throw.*away/i,
  /10.*minute/i,
  /20.*minute/i,
  /minute.*inbox/i,
  /burner.*mail/i,
  /guerrilla/i,
  /sharklaser/i,
  /yopmail/i,
  /mailinator/i,
  /dropmail/i,
  /boffweb/i,
  /mohmal/i,
  /getairmail/i,
  /generator.*email/i,
];

const TRUSTED_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'yahoo.co.uk',
  'yahoo.fr',
  'yahoo.de',
  'ymail.com',
  'rocketmail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'zohomail.in',
  'aol.com',
  'rediffmail.com',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'fastmail.com',
]);

/**
 * Checks whether an email address is from a known disposable / temporary mail domain.
 */
export function isDisposableEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const parts = email.trim().toLowerCase().split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1].trim();

  if (TRUSTED_DOMAINS.has(domain)) return false;

  const set = loadDisposableDomains();
  if (set.has(domain)) return true;

  // Check second-level subdomains, e.g. "sub.boffweb.com"
  const domainParts = domain.split('.');
  if (domainParts.length > 2) {
    const parentDomain = domainParts.slice(-2).join('.');
    if (set.has(parentDomain)) return true;
  }

  // Heuristic patterns
  for (const pattern of DISPOSABLE_PATTERNS) {
    if (pattern.test(domain)) {
      return true;
    }
  }

  return false;
}

/**
 * Strict asynchronous check with DNS MX verification for APIs and signup gateways.
 */
export async function validateEmailDomainStrict(email: string): Promise<{ valid: boolean; reason?: string }> {
  if (isDisposableEmail(email)) {
    return {
      valid: false,
      reason: 'Temporary or disposable email addresses are not allowed. Please enter your genuine personal email.',
    };
  }

  const parts = email.trim().toLowerCase().split('@');
  if (parts.length !== 2) {
    return { valid: false, reason: 'Please enter a valid email address.' };
  }
  const domain = parts[1].trim();

  if (TRUSTED_DOMAINS.has(domain)) {
    return { valid: true };
  }

  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return {
        valid: false,
        reason: 'This email domain does not have active mail servers. Please enter a genuine, active email address.',
      };
    }

    for (const record of mxRecords) {
      const exchange = (record.exchange || '').toLowerCase();
      for (const pattern of DISPOSABLE_PATTERNS) {
        if (pattern.test(exchange)) {
          return {
            valid: false,
            reason: 'Temporary or disposable email addresses are not allowed. Please enter your genuine personal email.',
          };
        }
      }
    }
  } catch (dnsErr: any) {
    const code = dnsErr?.code || '';
    if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'SERVFAIL') {
      return {
        valid: false,
        reason: 'This email domain does not exist or has no active mail servers. Please enter a genuine, active email address.',
      };
    }
  }

  return { valid: true };
}
