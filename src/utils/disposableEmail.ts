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
    const candidatePaths = [
      path.join(__dirname, '..', 'data', 'disposable-domains.json'),
      path.join(process.cwd(), 'src', 'data', 'disposable-domains.json'),
      path.join(process.cwd(), 'backend', 'src', 'data', 'disposable-domains.json'),
      'D:\\Vora\\Parent controll\\backend\\src\\data\\disposable-domains.json',
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const arr = JSON.parse(raw);
        cachedSet = new Set(arr.map((d: string) => d.toLowerCase().trim()));
        return cachedSet;
      }
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
  /ooynib/i,
  /mohmal/i,
  /getairmail/i,
  /generator.*email/i,
];

// Comprehensive Whitelist of Known Genuine Consumer Email Domains
export const WHITELISTED_CONSUMER_DOMAINS = new Set<string>([
  // Google
  'gmail.com',
  'googlemail.com',

  // Microsoft (Outlook, Hotmail, Live, MSN)
  'outlook.com',
  'outlook.in',
  'outlook.co.uk',
  'outlook.fr',
  'outlook.de',
  'outlook.es',
  'outlook.it',
  'outlook.com.au',
  'outlook.com.br',
  'outlook.ca',
  'hotmail.com',
  'hotmail.co.uk',
  'hotmail.fr',
  'hotmail.de',
  'hotmail.es',
  'hotmail.it',
  'hotmail.com.br',
  'hotmail.ca',
  'hotmail.co.jp',
  'live.com',
  'live.co.uk',
  'live.fr',
  'live.de',
  'live.it',
  'live.com.au',
  'live.ca',
  'live.in',
  'msn.com',
  'passport.com',

  // Yahoo! & RocketMail
  'yahoo.com',
  'yahoo.co.in',
  'yahoo.in',
  'yahoo.co.uk',
  'yahoo.ca',
  'yahoo.com.au',
  'yahoo.fr',
  'yahoo.de',
  'yahoo.es',
  'yahoo.it',
  'yahoo.co.jp',
  'yahoo.com.br',
  'yahoo.com.mx',
  'yahoo.com.ar',
  'yahoo.com.sg',
  'yahoo.com.ph',
  'yahoo.co.nz',
  'yahoo.co.id',
  'yahoo.com.hk',
  'yahoo.com.tw',
  'ymail.com',
  'rocketmail.com',

  // Apple
  'icloud.com',
  'me.com',
  'mac.com',

  // India
  'rediffmail.com',
  'rediff.com',

  // Zoho
  'zoho.com',
  'zohomail.in',
  'zohomail.com',
  'zoho.in',
  'zoho.eu',

  // Proton
  'proton.me',
  'protonmail.com',
  'protonmail.ch',
  'pm.me',

  // AOL
  'aol.com',
  'aim.com',
  'aol.co.uk',
  'aol.fr',
  'aol.de',

  // GMX & Mail.com
  'gmx.com',
  'gmx.net',
  'gmx.de',
  'gmx.at',
  'gmx.ch',
  'mail.com',

  // Fastmail
  'fastmail.com',
  'fastmail.fm',

  // Germany / Central Europe
  'web.de',
  't-online.de',
  'freenet.de',
  'posteo.de',

  // France
  'orange.fr',
  'wanadoo.fr',
  'free.fr',
  'sfr.fr',
  'laposte.net',

  // Italy
  'libero.it',
  'virgilio.it',
  'tim.it',
  'alice.it',

  // US & Canada Major Telecom / ISPs
  'comcast.net',
  'sbcglobal.net',
  'att.net',
  'verizon.net',
  'cox.net',
  'charter.net',
  'bellsouth.net',
  'earthlink.net',
  'shaw.ca',
  'sympatico.ca',
  'rogers.com',

  // UK Telecoms
  'btinternet.com',
  'virginmedia.com',
  'talktalk.net',
  'sky.com',

  // Russia / Eastern Europe
  'yandex.com',
  'yandex.ru',
  'ya.ru',
  'mail.ru',
  'bk.ru',
  'inbox.ru',
  'list.ru',

  // Japan / Korea
  'naver.com',
  'daum.net',
  'hanmail.net',
]);

// Patterns for verified business/custom domain mail exchanges (Google Workspace, Microsoft 365, etc.)
const VERIFIED_ENTERPRISE_MX_PATTERNS = [
  /aspmx.*\.google\.com$/i,
  /googlemail\.com$/i,
  /google\.com$/i,
  /outlook\.com$/i,
  /protection\.outlook\.com$/i,
  /protonmail\.ch$/i,
  /proton\.me$/i,
  /zoho\.com$/i,
  /zoho\.in$/i,
  /zoho\.eu$/i,
];

const REJECT_REASON =
  'For child safety and account recovery, please use your genuine personal email (Gmail, Outlook, Yahoo, or Apple) or a verified Google/Microsoft workspace email.';

export function extractDomain(email?: string | null): string {
  if (!email || typeof email !== 'string') return '';
  const clean = email.trim().toLowerCase();
  const atIndex = clean.lastIndexOf('@');
  if (atIndex === -1 || atIndex === clean.length - 1) return '';
  return clean.substring(atIndex + 1).trim();
}

/**
 * Checks whether an email address is from a known disposable / temporary mail domain.
 */
export function isDisposableEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const domain = extractDomain(email);
  if (!domain) return false;

  // 1. Consumer whitelist domains are never disposable
  if (WHITELISTED_CONSUMER_DOMAINS.has(domain)) return false;

  // 2. Check 98,000+ disposable domain database
  const set = loadDisposableDomains();
  if (set.has(domain)) return true;

  // 3. Check second-level subdomains, e.g. "sub.boffweb.com"
  const domainParts = domain.split('.');
  if (domainParts.length > 2) {
    const parentDomain = domainParts.slice(-2).join('.');
    if (set.has(parentDomain)) return true;
  }

  // 4. Heuristic patterns
  for (const pattern of DISPOSABLE_PATTERNS) {
    if (pattern.test(domain)) {
      return true;
    }
  }

  return false;
}

/**
 * Strict asynchronous check with Whitelist-first & DNS MX verification for APIs and signup gateways.
 */
export async function validateEmailDomainStrict(email: string): Promise<{ valid: boolean; reason?: string }> {
  const domain = extractDomain(email);
  if (!domain) {
    return { valid: false, reason: 'Please enter a valid email address.' };
  }

  // 1. TIER 1: Consumer Whitelist (Instant Pass)
  if (WHITELISTED_CONSUMER_DOMAINS.has(domain)) {
    return { valid: true };
  }

  // 2. Immediate Block: Disposable Database & Heuristic Patterns
  if (isDisposableEmail(email)) {
    return {
      valid: false,
      reason: REJECT_REASON,
    };
  }

  // 3. TIER 2: Enterprise MX Verification for Custom Domains
  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return {
        valid: false,
        reason: 'This email domain does not have active mail servers. Please enter a genuine, active email address.',
      };
    }

    // Verify if MX matches known enterprise providers (Google Workspace, Microsoft 365, Proton, Zoho)
    let isVerifiedEnterprise = false;
    for (const record of mxRecords) {
      const exchange = (record.exchange || '').toLowerCase();
      for (const pattern of VERIFIED_ENTERPRISE_MX_PATTERNS) {
        if (pattern.test(exchange)) {
          isVerifiedEnterprise = true;
          break;
        }
      }
      if (isVerifiedEnterprise) break;
    }

    if (isVerifiedEnterprise) {
      return { valid: true };
    }

    return {
      valid: false,
      reason: REJECT_REASON,
    };
  } catch (dnsErr: any) {
    return {
      valid: false,
      reason: 'This email domain does not exist or has no active mail servers. Please enter a genuine personal email (Gmail, Outlook, Yahoo, or Apple).',
    };
  }
}
