import { Appointment, AppointmentStatus, AppointmentType, AvailableAppointmentSlot } from "./starter-code/appointment";
import { Clinician } from "./starter-code/clinician";
import { filterForMaxAppointments } from "./maxAppointments";
import { LocalDay, localDayOf, LocalWeek, TimeZone, weekOf } from "./localDay";

/** README Details: assessment sessions are 90 minutes, therapy sessions 60. Exhaustive, so a new type fails to compile. */
export const APPOINTMENT_MINUTES: Readonly<Record<AppointmentType, number>> = {
  ASSESSMENT_SESSION_1: 90,
  ASSESSMENT_SESSION_2: 90,
  THERAPY_INTAKE: 60,
  THERAPY_SIXTY_MINS: 60,
};

const HOLDS_CLINICIAN_TIME: Readonly<Record<AppointmentStatus, boolean>> = {
  UPCOMING: true,
  OCCURRED: true,
  NO_SHOW: true,
  RE_SCHEDULED: false,
  CANCELLED: false,
  LATE_CANCELLATION: false,
};

/** The clinician columns capacity reads. A full Clinician row satisfies it. */
export type CapacityRow = Pick<Clinician, "timezone" | "maxDailyAppointments" | "maxWeeklyAppointments">;

/**
 * One clinician's remaining room, computed once from their appointment rows. Every LocalDay the scheduler
 * handles comes out of bookableDays and goes back into canBook, so slot days and appointment days are always
 * judged on the same calendar. Held counts are not reachable; callers ask whether something fits.
 */
export interface ClinicianCapacity {
  /**
   * The slots a patient may be offered, by the clinician's local day, days ascending, each day's slots in start
   * order, days with nothing offerable omitted. For each day: drop slots whose [date, date + sessionMinutes)
   * overlaps a held appointment (touching is fine); room = min(daily room, weekly room); keep
   * filterForMaxAppointments(free starts, sessionMinutes, room) (README Task 2, capacity-aware).
   */
  bookableDays(
    slots: readonly AvailableAppointmentSlot[],
    sessionMinutes: number,
  ): ReadonlyMap<LocalDay, readonly AvailableAppointmentSlot[]>;
  /**
   * Whether the clinician can take one more session on each entry of `days` at once (a repeated day means that
   * many sessions on it): for every distinct day held + requested <= maxDailyAppointments, and for every distinct
   * week held + requested <= maxWeeklyAppointments. The one cap rule; a pair in one week asks for 2 against that
   * week, so the pair-aware weekly cap is not a special case. `days` come from this capacity's bookableDays.
   */
  canBook(days: readonly LocalDay[]): boolean;
}

interface HeldInterval {
  readonly start: number;
  readonly end: number;
}

function count<K>(counts: Map<K, number>, key: K): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * Builds the capacity view from the clinician row and every appointment row of theirs (any status, any date).
 * Held rows (HOLDS_CLINICIAN_TIME) are counted on localDayOf(scheduledFor, timezone) and weekOf(that day) and
 * block [scheduledFor, scheduledFor + APPOINTMENT_MINUTES[type]).
 */
export function capacityOf(clinician: CapacityRow, appointments: readonly Appointment[]): ClinicianCapacity {
  const held: HeldInterval[] = [];
  const heldPerDay = new Map<LocalDay, number>();
  const heldPerWeek = new Map<LocalWeek, number>();
  for (const appointment of appointments) {
    if (!HOLDS_CLINICIAN_TIME[appointment.status]) continue;
    const start = appointment.scheduledFor.getTime();
    held.push({ start, end: start + APPOINTMENT_MINUTES[appointment.appointmentType] * 60_000 });
    const day = localDayOf(appointment.scheduledFor, clinician.timezone);
    count(heldPerDay, day);
    count(heldPerWeek, weekOf(day));
  }
  const room = (day: LocalDay) =>
    Math.min(
      clinician.maxDailyAppointments - (heldPerDay.get(day) ?? 0),
      clinician.maxWeeklyAppointments - (heldPerWeek.get(weekOf(day)) ?? 0),
    );

  return {
    bookableDays: (slots, sessionMinutes) => {
      const sessionMs = sessionMinutes * 60_000;
      const free = slots.filter((slot) => {
        const start = slot.date.getTime();
        return !held.some((h) => start < h.end && h.start < start + sessionMs);
      });
      const bookable = new Map<LocalDay, AvailableAppointmentSlot[]>();
      for (const [day, daySlots] of slotsByLocalDay(free, clinician.timezone)) {
        const kept = new Set(filterForMaxAppointments(daySlots.map((s) => s.date), sessionMinutes, room(day)).map((d) => d.getTime()));
        const offered = daySlots.filter((s) => kept.has(s.date.getTime()));
        if (offered.length > 0) bookable.set(day, offered);
      }
      return bookable;
    },
    canBook: (days) => {
      const requestedPerDay = new Map<LocalDay, number>();
      const requestedPerWeek = new Map<LocalWeek, number>();
      for (const day of days) {
        count(requestedPerDay, day);
        count(requestedPerWeek, weekOf(day));
      }
      return (
        [...requestedPerDay].every(([day, n]) => (heldPerDay.get(day) ?? 0) + n <= clinician.maxDailyAppointments) &&
        [...requestedPerWeek].every(([week, n]) => (heldPerWeek.get(week) ?? 0) + n <= clinician.maxWeeklyAppointments)
      );
    },
  };
}

function slotsByLocalDay(slots: readonly AvailableAppointmentSlot[], timezone: TimeZone): Map<LocalDay, AvailableAppointmentSlot[]> {
  const buckets = new Map<LocalDay, AvailableAppointmentSlot[]>();
  for (const slot of [...slots].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const day = localDayOf(slot.date, timezone);
    const bucket = buckets.get(day);
    if (bucket) bucket.push(slot);
    else buckets.set(day, [slot]);
  }
  return buckets;
}
