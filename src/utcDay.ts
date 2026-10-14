export type UtcDay = string & { readonly __brand: "UtcDay" };

/**
 * The UTC calendar day `instant` falls on, as "YYYY-MM-DD".
 * Throws RangeError for an invalid Date.
 */
export function utcDayOf(instant: Date): UtcDay {
  return instant.toISOString().slice(0, 10) as UtcDay;
}

/** Whole UTC calendar days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: UtcDay, to: UtcDay): number {
  return (Date.parse(to) - Date.parse(from)) / 86_400_000;
}
