import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { weeklyHoursSchema } from "./hours.js";
import { findOpenSlots, isWithinHours } from "./slots.js";

const tz = "America/New_York";
const hours = weeklyHoursSchema.parse({
  mon: [["09:00", "12:00"], ["13:00", "17:00"]],
  sat: [["10:00", "14:00"]],
});
// Sunday night, so Monday is fully bookable.
const now = new Date("2026-11-08T23:00:00-05:00");

describe("findOpenSlots", () => {
  it("returns slots on the step grid inside opening hours", () => {
    const slots = findOpenSlots({ date: "2026-11-09", timezone: tz, hours, durationMin: 60, busy: [], stepMin: 30, now });
    expect(slots[0]).toBe("2026-11-09T09:00:00-05:00");
    expect(slots).toContain("2026-11-09T11:00:00-05:00");
    // 11:30 + 60min would run past the lunch break
    expect(slots).not.toContain("2026-11-09T11:30:00-05:00");
    expect(slots.at(-1)).toBe("2026-11-09T16:00:00-05:00");
  });

  it("skips anything overlapping an existing booking", () => {
    const busy = [{ start: new Date("2026-11-09T10:00:00-05:00"), end: new Date("2026-11-09T10:45:00-05:00") }];
    const slots = findOpenSlots({ date: "2026-11-09", timezone: tz, hours, durationMin: 30, busy, stepMin: 15, now });
    expect(slots).toContain("2026-11-09T09:30:00-05:00");
    expect(slots).not.toContain("2026-11-09T09:45:00-05:00");
    expect(slots).not.toContain("2026-11-09T10:30:00-05:00");
    expect(slots).toContain("2026-11-09T10:45:00-05:00");
  });

  it("returns nothing on a closed day", () => {
    expect(findOpenSlots({ date: "2026-11-10", timezone: tz, hours, durationMin: 30, busy: [], now })).toEqual([]);
  });

  it("respects minimum notice", () => {
    const morning = new Date("2026-11-09T10:10:00-05:00");
    const slots = findOpenSlots({ date: "2026-11-09", timezone: tz, hours, durationMin: 30, busy: [], minNoticeMin: 60, now: morning });
    expect(slots[0]).toBe("2026-11-09T11:15:00-05:00");
  });

  it("handles the daylight saving change", () => {
    // DST ends 2026-11-01 in New York; 10:00 local is 15:00 UTC after the change.
    const sunday = weeklyHoursSchema.parse({ sun: [["10:00", "11:00"]] });
    const slots = findOpenSlots({ date: "2026-11-01", timezone: tz, hours: sunday, durationMin: 60, busy: [], now: new Date("2026-10-30T00:00:00Z") });
    expect(slots).toEqual(["2026-11-01T10:00:00-05:00"]);
  });
});

describe("isWithinHours", () => {
  it("accepts a slot fully inside a range and rejects one that spills over", () => {
    expect(isWithinHours(DateTime.fromISO("2026-11-09T16:00", { zone: tz }), 60, hours)).toBe(true);
    expect(isWithinHours(DateTime.fromISO("2026-11-09T16:30", { zone: tz }), 60, hours)).toBe(false);
  });
});

describe("weeklyHoursSchema", () => {
  it("rejects ranges that close before they open", () => {
    expect(() => weeklyHoursSchema.parse({ mon: [["17:00", "09:00"]] })).toThrow(/closes before it opens/);
  });
});
