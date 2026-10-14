import { daysBetween, LocalDay, localDayOf, LocalWeek, parseTimeZone, TimeZone, weekOf } from "./localDay";

const NEW_YORK = parseTimeZone("America/New_York");
const at = (iso: string) => new Date(iso);

describe("parseTimeZone", () => {
  it("returns ICU's resolved spelling of a known zone", () => {
    expect(parseTimeZone("america/new_york")).toBe("America/New_York");
    expect(parseTimeZone("US/Eastern")).toBe("America/New_York");
    expect(parseTimeZone("EST")).toBe("America/Panama");
  });

  it.each(["America/Nowhere", "", "New York", "+05:00"])("rejects %p with a RangeError naming the input", (raw) => {
    expect(() => parseTimeZone(raw)).toThrow(RangeError);
    expect(() => parseTimeZone(raw)).toThrow(raw);
  });

  it("rejects a plain string as a TimeZone or a LocalDay at compile time", () => {
    const typeChecksOnly = () => {
      // @ts-expect-error a plain string is not a TimeZone
      const zone: TimeZone = "America/New_York";
      // @ts-expect-error a plain string is not a LocalDay
      const day: LocalDay = "2024-08-19";
      void zone;
      void day;
    };
    expect(typeof typeChecksOnly).toBe("function");
  });
});

describe("localDayOf", () => {
  it("puts an instant after UTC midnight on the previous New York day", () => {
    expect(localDayOf(at("2024-08-20T02:00:00.000Z"), NEW_YORK)).toBe("2024-08-19");
  });

  it("keeps a midday instant on the same day across zones", () => {
    const noon = at("2024-08-19T12:00:00.000Z");
    expect(localDayOf(noon, NEW_YORK)).toBe("2024-08-19");
    expect(localDayOf(noon, parseTimeZone("UTC"))).toBe("2024-08-19");
    expect(localDayOf(noon, parseTimeZone("Pacific/Honolulu"))).toBe("2024-08-19");
  });

  it("puts a UTC afternoon on the next day in Tokyo", () => {
    expect(localDayOf(at("2024-08-19T15:00:00.000Z"), parseTimeZone("Asia/Tokyo"))).toBe("2024-08-20");
  });

  it("counts the 25-hour fall-back day in New York as one day", () => {
    const days = ["2024-11-03T04:30:00.000Z", "2024-11-03T05:30:00.000Z", "2024-11-03T06:30:00.000Z", "2024-11-04T04:30:00.000Z"];
    expect(days.map((iso) => localDayOf(at(iso), NEW_YORK))).toEqual(["2024-11-03", "2024-11-03", "2024-11-03", "2024-11-03"]);
    expect(localDayOf(at("2024-11-04T05:00:00.000Z"), NEW_YORK)).toBe("2024-11-04");
  });

  it("throws a RangeError for an invalid date", () => {
    expect(() => localDayOf(at("not a date"), NEW_YORK)).toThrow(RangeError);
  });
});

describe("daysBetween", () => {
  const day = (iso: string) => localDayOf(at(iso), NEW_YORK);

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

  it("counts the week across the fall-back change as 7", () => {
    const from = day("2024-10-28T03:30:00.000Z");
    const to = day("2024-11-04T04:30:00.000Z");
    expect([from, to]).toEqual(["2024-10-27", "2024-11-03"]);
    expect(daysBetween(from, to)).toBe(7);
  });
});

describe("weekOf", () => {
  const day = (ymd: string) => localDayOf(at(`${ymd}T12:00:00.000Z`), NEW_YORK);

  it("names a Monday-to-Sunday week by its Monday", () => {
    expect(weekOf(day("2024-08-19"))).toBe("2024-08-19");
    expect(weekOf(day("2024-08-21"))).toBe("2024-08-19");
    expect(weekOf(day("2024-08-25"))).toBe("2024-08-19");
  });

  it("starts a new week on Monday", () => {
    expect(weekOf(day("2024-08-26"))).toBe("2024-08-26");
    expect(weekOf(day("2024-09-01"))).toBe("2024-08-26");
  });

  it("crosses a year boundary", () => {
    expect(weekOf(day("2025-01-01"))).toBe("2024-12-30");
  });

  it("is label arithmetic across the fall-back day", () => {
    expect(weekOf(day("2024-11-03"))).toBe("2024-10-28");
    expect(weekOf(day("2024-11-04"))).toBe("2024-11-04");
  });

  it("rejects a LocalDay as a LocalWeek and the reverse at compile time", () => {
    const typeChecksOnly = () => {
      // @ts-expect-error a LocalDay is not a LocalWeek
      const week: LocalWeek = day("2024-08-19");
      // @ts-expect-error a LocalWeek is not a LocalDay
      const asDay: LocalDay = weekOf(day("2024-08-19"));
      // @ts-expect-error a plain string is not a LocalWeek
      const plain: LocalWeek = "2024-08-19";
      void week;
      void asDay;
      void plain;
    };
    expect(typeof typeChecksOnly).toBe("function");
  });
});
