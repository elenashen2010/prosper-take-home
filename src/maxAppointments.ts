/**
 * README Task 2. The day's target is min(maximum packing, `maxAppointments`), the most appointments
 * of `durationMinutes` that can still happen that day. Keeps a start iff some set of non-overlapping
 * appointments through it reaches the target, so booking any offered start leaves the target
 * reachable. With the default target this is the README rule: a run of starts too short for two
 * appointments is kept whole (12:00, 12:15, 12:30 at 90 minutes); in the README ladder 12:00..13:30
 * only 12:00 and 13:30 survive. With `maxAppointments` 1 every start is kept, with 0 nothing is.
 * Appointments may touch. No grid or spacing is assumed. Returns the input's own Date objects in
 * input order; equal instants are kept or dropped together. Throws RangeError unless
 * `durationMinutes` is a positive finite number.
 */
export function filterForMaxAppointments(dates: readonly Date[], durationMinutes: number, maxAppointments = Infinity): Date[] {
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

  const target = Math.min(Math.max(0, ...longestEndingAt), maxAppointments);
  if (target <= 0) return [];
  const kept = new Set(starts.filter((_, i) => longestEndingAt[i] + longestStartingAt[i] - 1 >= target));
  return dates.filter((d) => kept.has(d.getTime()));
}
