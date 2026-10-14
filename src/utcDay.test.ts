import { daysBetween, UtcDay, utcDayOf } from "./utcDay";

describe("utcDayOf", () => {
  it("returns the calendar day of a midday instant", () => {
    expect(utcDayOf(new Date("2024-08-19T12:00:00.000Z"))).toBe("2024-08-19");
  });

  it("keeps a late-evening start on its own day", () => {
    expect(utcDayOf(new Date("2024-09-26T22:30:00.000Z"))).toBe("2024-09-26");
  });

  it("puts midnight on the new day", () => {
    expect(utcDayOf(new Date("2024-09-27T00:00:00.000Z"))).toBe("2024-09-27");
  });

  it("lands an offset input on its UTC day", () => {
    expect(utcDayOf(new Date("2024-08-19T20:00:00-05:00"))).toBe("2024-08-20");
  });

  it("throws a RangeError for an invalid date", () => {
    expect(() => utcDayOf(new Date("not a date"))).toThrow(RangeError);
  });

  it("rejects a plain string as a UtcDay at compile time", () => {
    const typeChecksOnly = () => {
      // @ts-expect-error a plain string is not a UtcDay
      const day: UtcDay = "2024-08-19";
      void day;
    };
    expect(typeof typeChecksOnly).toBe("function");
  });
});

describe("daysBetween", () => {
  const day = (iso: string) => utcDayOf(new Date(iso));

  it("is 0 for the same day", () => {
    expect(daysBetween(day("2024-08-21T12:00:00.000Z"), day("2024-08-21T15:00:00.000Z"))).toBe(0);
  });

  it("counts a week as 7", () => {
    expect(daysBetween(day("2024-08-21T12:00:00.000Z"), day("2024-08-28T12:15:00.000Z"))).toBe(7);
  });

  it("counts 9 days from 08-19 to 08-28", () => {
    expect(daysBetween(day("2024-08-19T12:00:00.000Z"), day("2024-08-28T12:15:00.000Z"))).toBe(9);
  });

  it("is negative when the second day is earlier", () => {
    expect(daysBetween(day("2024-08-28T12:00:00.000Z"), day("2024-08-21T12:00:00.000Z"))).toBe(-7);
  });

  it("counts across a month boundary", () => {
    expect(daysBetween(day("2024-08-30T12:00:00.000Z"), day("2024-09-02T12:00:00.000Z"))).toBe(3);
  });
});
