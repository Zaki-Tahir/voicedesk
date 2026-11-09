import { describe, expect, it } from "vitest";
import { InMemoryBookingRepository } from "../booking/memory-repository.js";
import { BookingService } from "../booking/service.js";
import type { BusinessProfile } from "../booking/types.js";
import { InMemoryCalendarProvider } from "../calendar/memory.js";
import { weeklyHoursSchema } from "../scheduling/hours.js";
import { buildInstructions } from "./instructions.js";
import { createToolHandler } from "./tools.js";

const business: BusinessProfile = {
  id: "biz_1",
  name: "Glow Nail Studio",
  phoneNumber: "+12015550100",
  timezone: "America/New_York",
  greeting: "Hi, thanks for calling Glow!",
  notes: "Free parking behind the building.",
  hours: weeklyHoursSchema.parse({ mon: [["10:00", "18:00"]] }),
  calendarId: null,
  services: [{ id: "svc_1", name: "Gel Manicure", durationMin: 45, priceCents: 4000 }],
};

function setup() {
  const repo = new InMemoryBookingRepository([business]);
  const booking = new BookingService(
    repo,
    new InMemoryCalendarProvider(),
    { enqueue: async () => {} },
    () => new Date("2026-11-08T12:00:00-05:00"),
  );
  const handle = createToolHandler({ business, booking, callId: "call_1", callerNumber: "+12015550177" });
  return { repo, handle };
}

describe("tool handler", () => {
  it("returns open slots", async () => {
    const { handle } = setup();
    const out = JSON.parse(await handle("check_availability", JSON.stringify({ service: "gel manicure", date: "2026-11-09" })));
    expect(out.service).toBe("Gel Manicure");
    expect(out.slots[0]).toBe("2026-11-09T10:00:00-05:00");
    expect(out.slots.length).toBeLessThanOrEqual(12);
  });

  it("books using the caller's number by default", async () => {
    const { handle, repo } = setup();
    const args = { service: "Gel Manicure", start: "2026-11-09T14:00", customer_name: "Jen Park" };
    const out = JSON.parse(await handle("book_appointment", JSON.stringify(args)));
    expect(out.booked).toBe(true);
    expect(repo.appointments[0]?.customerPhone).toBe("+12015550177");
  });

  it("turns booking problems and bad arguments into errors the model can talk about", async () => {
    const { handle } = setup();
    const taken = JSON.stringify({ service: "Gel Manicure", start: "2026-11-09T14:00", customer_name: "Jen Park" });
    await handle("book_appointment", taken);
    expect(JSON.parse(await handle("book_appointment", taken))).toEqual({ error: "That time is no longer available" });
    expect(JSON.parse(await handle("book_appointment", "{not json"))).toHaveProperty("error");
    expect(JSON.parse(await handle("check_availability", "{}"))).toHaveProperty("error");
    expect(JSON.parse(await handle("order_pizza", "{}"))).toEqual({ error: "Unknown tool order_pizza" });
  });
});

describe("buildInstructions", () => {
  it("includes today's date in the business timezone, hours, services and notes", () => {
    const text = buildInstructions(business, new Date("2026-11-09T03:30:00Z"));
    expect(text).toContain("Today is Sunday, November 8, 2026");
    expect(text).toContain("Monday: 10:00-18:00");
    expect(text).toContain("Tuesday: closed");
    expect(text).toContain("Gel Manicure (45 min, $40.00)");
    expect(text).toContain("Free parking");
  });
});
