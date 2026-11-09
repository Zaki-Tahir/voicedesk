import { describe, expect, it } from "vitest";
import { dayKey, formatDateTime, formatDayHeading, formatDuration, formatPhone, formatPrice } from "./format";

const tz = "America/New_York";

describe("format helpers", () => {
  it("formats US numbers and leaves others alone", () => {
    expect(formatPhone("+12015550199")).toBe("(201) 555-0199");
    expect(formatPhone("+447700900123")).toBe("+447700900123");
  });

  it("formats call durations", () => {
    expect(formatDuration("2026-11-09T15:00:00Z", "2026-11-09T15:02:05Z")).toBe("2m 05s");
    expect(formatDuration("2026-11-09T15:00:00Z", "2026-11-09T15:00:42Z")).toBe("42s");
    expect(formatDuration("2026-11-09T15:00:00Z", null)).toBe("—");
  });

  it("formats prices", () => {
    expect(formatPrice(3500)).toBe("$35");
    expect(formatPrice(1250)).toBe("$12.50");
    expect(formatPrice(null)).toBe("—");
  });

  it("shows times in the business timezone", () => {
    expect(formatDateTime("2026-11-09T15:00:00Z", tz)).toBe("Mon, Nov 9, 10:00 AM");
    // 2am UTC on the 10th is still the 9th in New York
    expect(dayKey("2026-11-10T02:00:00Z", tz)).toBe("2026-11-09");
  });

  it("labels today and tomorrow", () => {
    const now = new Date("2026-11-09T15:00:00Z");
    expect(formatDayHeading("2026-11-09", tz, now)).toBe("Today");
    expect(formatDayHeading("2026-11-10", tz, now)).toBe("Tomorrow");
    expect(formatDayHeading("2026-11-12", tz, now)).toBe("Thursday, November 12");
  });
});
