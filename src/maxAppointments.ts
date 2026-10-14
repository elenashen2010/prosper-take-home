/**
 * README Task 2. Keeps a start iff some maximum-size set of non-overlapping appointments of
 * `durationMinutes` includes it, so booking any offered start leaves the number of bookable
 * appointments unchanged. A run of starts too short for two appointments is kept whole (12:00,
 * 12:15, 12:30 at 90 minutes); in the README ladder 12:00..13:30 only 12:00 and 13:30 survive.
 * Appointments may touch. No grid or spacing is assumed. Returns the input's own Date objects in
 * input order; equal instants are kept or dropped together. Throws RangeError unless
 * `durationMinutes` is a positive finite number.
 */
export function filterForMaxAppointments(dates: readonly Date[], durationMinutes: number): Date[] {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new RangeError(`durationMinutes must be a positive finite number, got ${durationMinutes}`);
  }
  const durationMs = durationMinutes * 60_000;
  const starts = [...new Set(dates.map((d) => d.getTime()))].sort((a, b) => a - b);

  const longestEndingAt = starts.map(() => 1);
  for (let i = 0; i < starts.length; i++) {
    for (let k = 0; k < i; k++) {
      if (starts[k] + durationMs <= starts[i]) {
        longestEndingAt[i] = Math.max(longestEndingAt[i], longestEndingAt[k] + 1);
      }
    }
  }
  const longestStartingAt = starts.map(() => 1);
  for (let i = starts.length - 1; i >= 0; i--) {
    for (let k = i + 1; k < starts.length; k++) {
      if (starts[k] >= starts[i] + durationMs) {
        longestStartingAt[i] = Math.max(longestStartingAt[i], longestStartingAt[k] + 1);
      }
    }
  }

  const maximum = Math.max(0, ...longestEndingAt);
  const kept = new Set(starts.filter((_, i) => longestEndingAt[i] + longestStartingAt[i] - 1 === maximum));
  return dates.filter((d) => kept.has(d.getTime()));
}
