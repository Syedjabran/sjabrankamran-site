/**
 * Pakistan wall-clock time helpers. Isomorphic (no server imports), so both
 * route handlers and client components can use them.
 *
 * The school runs on Asia/Karachi (UTC+5, no DST) but the servers run in UTC.
 * Two mistakes follow from that unless every boundary is explicit:
 *  - an <input type="datetime-local"> value ("2026-09-30T09:00") has no zone,
 *    and `new Date(value)` on a UTC server reads it as 09:00 UTC = 14:00 PKT;
 *  - `toLocaleString()` / `getHours()` on the server format in UTC.
 */

export const PK_TZ = "Asia/Karachi";
export const PK_OFFSET = "+05:00";

const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)?$/;

/**
 * Parse a date/time the way staff typed it. A zone-less wall-clock value is
 * read as Pakistan time; a value that already carries `Z` or an offset (e.g.
 * an ISO string from `toISOString()`) is parsed as-is. Returns null when the
 * value is empty or not a valid date.
 */
export function parsePkDateTime(value: string | null | undefined): Date | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  let d: Date;
  if (HAS_ZONE.test(v)) d = new Date(v);
  else if (WALL_CLOCK.test(v)) d = new Date(`${v.includes("T") ? v : `${v}T00:00`}${PK_OFFSET}`);
  else return null;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `parsePkDateTime` as an ISO string, or null. */
export function pkDateTimeToIso(value: string | null | undefined): string | null {
  return parsePkDateTime(value)?.toISOString() ?? null;
}

/** Format an instant in Pakistan time (defaults: "Thu 25 Sep, 16:00"). */
export function formatPk(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false },
): string {
  return new Date(value).toLocaleString("en-GB", { ...options, timeZone: PK_TZ });
}

/** Today's calendar date in Pakistan as YYYY-MM-DD. */
export function pkToday(now: number | Date = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PK_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}
