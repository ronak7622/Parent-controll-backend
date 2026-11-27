/**
 * Timezone-aware date range helpers for 10M+ scale MongoDB queries.
 *
 * All day-boundary queries convert a calendar date (`YYYY-MM-DD`) in the
 * caller's local timezone (defaults to IST +05:30 = 330 minutes ahead of UTC
 * when the client does not send `x-timezone-offset` or `tzOffset`) into exact
 * UTC `Date` bounds so MongoDB compound indexes on `{ deviceId, timestamp }`
 * are used directly without leaking 12:00 AM - 05:29 AM local rows into the
 * wrong day.
 */

export const DEFAULT_TZ_OFFSET_MINUTES = 330; // Asia/Kolkata (+05:30)

/**
 * Resolves the caller's timezone offset in minutes ahead of UTC (e.g. +330 for IST).
 * Supports `req.query.tzOffset` or `req.headers['x-timezone-offset']`.
 */
export function resolveTzOffsetMinutes(req?: any): number {
  const raw = req?.query?.tzOffset ?? req?.headers?.['x-timezone-offset'];
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const parsed = Number(raw);
    if (!Number.isNaN(parsed) && parsed >= -720 && parsed <= 840) {
      return parsed;
    }
  }
  return DEFAULT_TZ_OFFSET_MINUTES;
}

/**
 * Returns exact UTC `[start, end]` Date bounds for a `YYYY-MM-DD` calendar date
 * in the specified timezone offset (minutes ahead of UTC).
 */
export function getDayBounds(
  dateInput: string | Date,
  tzOffsetMinutes: number = DEFAULT_TZ_OFFSET_MINUTES
): { start: Date; end: Date; dateStr: string } | null {
  let y: number;
  let m: number;
  let d: number;
  let dateStr: string;

  if (dateInput instanceof Date) {
    if (Number.isNaN(dateInput.getTime())) return null;
    const shifted = new Date(dateInput.getTime() + tzOffsetMinutes * 60_000);
    y = shifted.getUTCFullYear();
    m = shifted.getUTCMonth() + 1;
    d = shifted.getUTCDate();
    dateStr = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  } else {
    const trimmed = String(dateInput).trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      y = Number(match[1]);
      m = Number(match[2]);
      d = Number(match[3]);
      dateStr = `${match[1]}-${match[2]}-${match[3]}`;
    } else {
      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) return null;
      const shifted = new Date(parsed.getTime() + tzOffsetMinutes * 60_000);
      y = shifted.getUTCFullYear();
      m = shifted.getUTCMonth() + 1;
      d = shifted.getUTCDate();
      dateStr = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const utcMidnightMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const start = new Date(utcMidnightMs - tzOffsetMinutes * 60_000);
  const end = new Date(utcMidnightMs + 86_400_000 - 1 - tzOffsetMinutes * 60_000);
  return { start, end, dateStr };
}

/**
 * Resolves the UTC offset in minutes ahead of UTC for an IANA timezone name
 * (e.g. 'Asia/Kolkata' -> +330, 'America/New_York' -> -300 / -240).
 * Falls back to DEFAULT_TZ_OFFSET_MINUTES (+330) only when tz is missing/invalid.
 */
export function getOffsetMinutesForTimeZone(ianaTimeZone?: string, refDate: Date = new Date()): number {
  const tz = (ianaTimeZone || '').trim();
  if (!tz) return DEFAULT_TZ_OFFSET_MINUTES;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(refDate);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
    const y = get('year');
    const m = get('month');
    const d = get('day');
    const h = get('hour') === 24 ? 0 : get('hour');
    const min = get('minute');
    const sec = get('second');
    const tzWallMs = Date.UTC(y, m - 1, d, h, min, sec);
    const refSecMs = Math.floor(refDate.getTime() / 1000) * 1000;
    return Math.round((tzWallMs - refSecMs) / 60_000);
  } catch {
    return DEFAULT_TZ_OFFSET_MINUTES;
  }
}

/**
 * Formats a Date/timestamp into `YYYY-MM-DD` in the given IANA timezone.
 * Falls back to 'Asia/Kolkata' only when tz is missing/invalid.
 */
export function getDateStringInTimeZone(
  dateInput: Date | string | number = new Date(),
  ianaTimeZone?: string
): string {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const validDate = Number.isNaN(d.getTime()) ? new Date() : d;
  const tz = (ianaTimeZone || '').trim() || 'Asia/Kolkata';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(validDate);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(validDate);
  }
}

/**
 * Parses a naive wall-clock date string (`YYYY-MM-DD HH:mm[:ss]`) in the given
 * IANA timezone, returning the exact UTC Date. Falls back to IST (+05:30) only
 * when tz is missing/invalid.
 */
export function parseNaiveDateInTimeZone(naiveStr: string, ianaTimeZone?: string): Date {
  const match = naiveStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?$/);
  if (!match) return new Date(naiveStr);
  const [, y, m, d, hr, min, sec = '0', ms = '0'] = match;
  const wallMs = Date.UTC(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(hr),
    Number(min),
    Number(sec),
    Number(ms.slice(0, 3).padEnd(3, '0'))
  );
  const offsetMin = getOffsetMinutesForTimeZone(ianaTimeZone, new Date(wallMs));
  return new Date(wallMs - offsetMin * 60_000);
}
