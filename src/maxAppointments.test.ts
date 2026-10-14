import { filterForMaxAppointments } from "./maxAppointments";
import { MOCK_SLOT_DATA } from "./starter-code/mock-slot-data";
import { localDayOf, parseTimeZone } from "./localDay";

const at = (iso: string) => new Date(iso);
const times = (dates: Date[]) => dates.map((d) => d.toISOString());

const README_LADDER = [
  "2024-08-19T12:00:00.000Z",
  "2024-08-19T12:15:00.000Z",
  "2024-08-19T12:30:00.000Z",
  "2024-08-19T12:45:00.000Z",
  "2024-08-19T13:00:00.000Z",
  "2024-08-19T13:15:00.000Z",
  "2024-08-19T13:30:00.000Z",
];

describe("filterForMaxAppointments", () => {
  it("keeps only 12:00 and 13:30 from the README ladder", () => {
    expect(times(filterForMaxAppointments(README_LADDER.map(at), 90))).toEqual([
      "2024-08-19T12:00:00.000Z",
      "2024-08-19T13:30:00.000Z",
    ]);
  });

  it("keeps a block too short for two sessions whole", () => {
    const block = ["2024-08-19T12:00:00.000Z", "2024-08-19T12:15:00.000Z", "2024-08-19T12:30:00.000Z"];
    expect(times(filterForMaxAppointments(block.map(at), 90))).toEqual(block);
  });

  it("hides only 13:15 from an eleven-step ladder", () => {
    const ladder = [
      ...README_LADDER,
      "2024-08-19T13:45:00.000Z",
      "2024-08-19T14:00:00.000Z",
      "2024-08-19T14:15:00.000Z",
      "2024-08-19T14:30:00.000Z",
    ];
    expect(times(filterForMaxAppointments(ladder.map(at), 90))).toEqual([
      "2024-08-19T12:00:00.000Z",
      "2024-08-19T12:15:00.000Z",
      "2024-08-19T12:30:00.000Z",
      "2024-08-19T12:45:00.000Z",
      "2024-08-19T13:00:00.000Z",
      "2024-08-19T13:30:00.000Z",
      "2024-08-19T13:45:00.000Z",
      "2024-08-19T14:00:00.000Z",
      "2024-08-19T14:15:00.000Z",
      "2024-08-19T14:30:00.000Z",
    ]);
  });

  it("treats two separate blocks on one day independently", () => {
    const day = ["12:00", "12:15", "12:30", "21:00", "21:15", "21:30", "21:45", "22:00", "22:15", "22:30"];
    expect(times(filterForMaxAppointments(day.map((t) => at(`2024-09-03T${t}:00.000Z`)), 90))).toEqual([
      "2024-09-03T12:00:00.000Z",
      "2024-09-03T12:15:00.000Z",
      "2024-09-03T12:30:00.000Z",
      "2024-09-03T21:00:00.000Z",
      "2024-09-03T22:30:00.000Z",
    ]);
  });

  it("handles starts off any grid and other durations", () => {
    const starts = ["2024-08-19T09:00:00.000Z", "2024-08-19T09:40:00.000Z", "2024-08-19T10:00:00.000Z"];
    expect(times(filterForMaxAppointments(starts.map(at), 60))).toEqual([
      "2024-08-19T09:00:00.000Z",
      "2024-08-19T10:00:00.000Z",
    ]);
    expect(times(filterForMaxAppointments(starts.map(at), 90))).toEqual(starts);
  });

  it("lets sessions touch end to start", () => {
    const starts = ["2024-08-19T12:00:00.000Z", "2024-08-19T13:30:00.000Z"];
    expect(times(filterForMaxAppointments(starts.map(at), 90))).toEqual(starts);
  });

  it("returns the input's own dates in input order", () => {
    const reversed = [...README_LADDER].reverse().map(at);
    const kept = filterForMaxAppointments(reversed, 90);
    expect(times(kept)).toEqual(["2024-08-19T13:30:00.000Z", "2024-08-19T12:00:00.000Z"]);
    expect(kept[0]).toBe(reversed[0]);
    expect(kept[1]).toBe(reversed[6]);
  });

  it("keeps or drops equal instants together", () => {
    const kept = ["2024-08-19T12:00:00.000Z", "2024-08-19T12:00:00.000Z", "2024-08-19T13:30:00.000Z"];
    expect(times(filterForMaxAppointments(kept.map(at), 90))).toEqual(kept);
    const dropped = [
      "2024-08-19T12:00:00.000Z",
      "2024-08-19T12:15:00.000Z",
      "2024-08-19T12:15:00.000Z",
      "2024-08-19T13:30:00.000Z",
    ];
    expect(times(filterForMaxAppointments(dropped.map(at), 90))).toEqual([
      "2024-08-19T12:00:00.000Z",
      "2024-08-19T13:30:00.000Z",
    ]);
  });

  it("returns nothing for no dates", () => {
    expect(filterForMaxAppointments([], 90)).toEqual([]);
  });

  it.each([0, -90, NaN, Infinity])("rejects a duration of %p", (duration) => {
    expect(() => filterForMaxAppointments(README_LADDER.map(at), duration)).toThrow(RangeError);
  });

  it("keeps 246 of the full seed's 458 slots, day by day", () => {
    const newYork = parseTimeZone("America/New_York");
    const days = new Map<string, Date[]>();
    for (const row of MOCK_SLOT_DATA) {
      const date = new Date(row.date);
      const day = localDayOf(date, newYork);
      days.set(day, [...(days.get(day) ?? []), date]);
    }
    const kept = new Map([...days].map(([day, dates]) => [day, filterForMaxAppointments(dates, 90)]));
    const hhmm = (day: string) => (kept.get(day) ?? []).map((d) => d.toISOString().slice(11, 16));

    expect(MOCK_SLOT_DATA).toHaveLength(458);
    expect([...kept.values()].reduce((sum, dates) => sum + dates.length, 0)).toBe(246);
    expect(hhmm("2024-08-19")).toEqual(["12:00", "12:15", "12:30", "14:45", "15:00", "15:15", "15:30"]);
    expect(hhmm("2024-08-22")).toEqual([
      "12:00", "12:15", "12:30", "12:45", "13:00", "13:30", "13:45", "14:00", "14:15", "14:30",
    ]);
    expect(hhmm("2024-08-23")).toEqual(["13:30", "13:45", "14:00", "15:00", "15:15", "15:30", "21:00"]);
    expect(hhmm("2024-08-28")).toEqual([
      "12:00", "12:15", "12:30", "13:30", "13:45", "14:00", "15:00", "15:15", "15:30",
    ]);
    expect(hhmm("2024-09-03")).toEqual(["12:00", "12:15", "12:30", "21:00", "22:30"]);
  });
});
