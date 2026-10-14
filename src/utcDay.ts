export type UtcDay = string & { readonly __brand: "UtcDay" };

/**
 * The UTC calendar day `instant` falls on, as "YYYY-MM-DD".
 * Throws RangeError for an invalid Date.
 */
export function utcDayOf(instant: Date): UtcDay {
  return instant.toISOString().slice(0, 10) as UtcDay;
}
