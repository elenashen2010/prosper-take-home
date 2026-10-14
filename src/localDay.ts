/** An IANA zone name in ICU's resolved spelling, such as "America/New_York". Only parseTimeZone makes one. */
export type TimeZone = string & { readonly __brand: "TimeZone" };

/**
 * A calendar day "YYYY-MM-DD" on one clinician's calendar. It carries no zone, so it is comparable only
 * with days from the same zone; every caller produces both sides of a comparison from one `timezone`.
 */
export type LocalDay = string & { readonly __brand: "LocalDay" };

const formatters = new Map<TimeZone, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  const cached = formatters.get(zone as TimeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
  formatters.set(formatter.resolvedOptions().timeZone as TimeZone, formatter);
  return formatter;
}

/**
 * Parses a zone name (a database column, a seed literal) into ICU's resolved spelling: "america/new_york"
 * and "US/Eastern" become "America/New_York", "EST" becomes "America/Panama". Throws RangeError naming the
 * input for a name ICU does not know and for a UTC offset such as "+05:00", which Intl accepts but which
 * carries no daylight-saving rules.
 */
export function parseTimeZone(raw: string): TimeZone {
  let zone: string;
  try {
    zone = formatterFor(raw).resolvedOptions().timeZone;
  } catch {
    throw new RangeError(`not an IANA time zone: "${raw}"`);
  }
  if (/^[+-]/.test(zone)) throw new RangeError(`not an IANA time zone, a UTC offset: "${raw}"`);
  return zone as TimeZone;
}

/**
 * The calendar day `instant` falls on in `zone`. Daylight-saving changes are ICU's: in America/New_York
 * 2024-11-03 runs 25 hours, from 2024-11-03T04:00Z to 2024-11-04T05:00Z. Throws RangeError for an invalid Date.
 */
export function localDayOf(instant: Date, zone: TimeZone): LocalDay {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of formatterFor(zone).formatToParts(instant)) parts[type] = value;
  return `${parts.year}-${parts.month}-${parts.day}` as LocalDay;
}

/** Whole calendar days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: LocalDay, to: LocalDay): number {
  return (Date.parse(to) - Date.parse(from)) / 86_400_000;
}

/** Date#getUTCDay numbering: 0 is Sunday, 1 is Monday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The day every clinician's week starts on. ISO 8601 Monday, since the README does not say. A Sunday start is 0. */
export const WEEK_STARTS_ON: Weekday = 1;

/**
 * A week on one clinician's calendar, named by its first day "YYYY-MM-DD". Branded apart from LocalDay so a
 * day count can never be looked up by a week key or the reverse. Only weekOf makes one.
 */
export type LocalWeek = string & { readonly __brand: "LocalWeek" };

/**
 * The week `day` belongs to. Label arithmetic, no zone: weekOf("2024-08-25") is "2024-08-19" and
 * weekOf("2025-01-01") is "2024-12-30".
 */
export function weekOf(day: LocalDay): LocalWeek {
  const first = new Date(Date.parse(day));
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() - WEEK_STARTS_ON + 7) % 7));
  return first.toISOString().slice(0, 10) as LocalWeek;
}
