import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryCalendarProvider } from "../calendar/memory.js";
import type { JobName, JobPayloads, JobQueue } from "../queue/jobs.js";
import { weeklyHoursSchema } from "../scheduling/hours.js";
import { InMemoryBookingRepository } from "./memory-repository.js";
import { BookingError, BookingService } from "./service.js";
import type { BusinessProfile } from "./types.js";

class RecordingQueue implements JobQueue {
  jobs: { name: JobName; payload: unknown }[] = [];
  async enqueue<N extends JobName>(name: N, payload: JobPayloads[N]) {
    this.jobs.push({ name, payload });
  }
}

const business: BusinessProfile = {
  id: "biz_1",
  name: "Fade Factory Barbershop",
  phoneNumber: "+12015550100",
  timezone: "America/New_York",
  greeting: "Thanks for calling Fade Factory!",
  notes: "",
  hours: weeklyHoursSchema.parse({ mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]] }),
  calendarId: "cal_1",
  services: [
    { id: "svc_cut", name: "Haircut", durationMin: 30, priceCents: 3500 },
    { id: "svc_beard", name: "Beard Trim", durationMin: 15, priceCents: 1500 },
  ],
};

const now = () => new Date("2026-11-08T12:00:00-05:00");

describe("BookingService", () => {
  let repo: InMemoryBookingRepository;
  let calendar: InMemoryCalendarProvider;
  let queue: RecordingQueue;
  let service: BookingService;

  beforeEach(() => {
    repo = new InMemoryBookingRepository([business]);
    calendar = new InMemoryCalendarProvider();
    queue = new RecordingQueue();
    service = new BookingService(repo, calendar, queue, now);
  });

  it("treats existing calendar events as busy", async () => {
    await calendar.createEvent("cal_1", {
      summary: "Lunch",
      description: "",
      start: new Date("2026-11-09T12:00:00-05:00"),
      end: new Date("2026-11-09T13:00:00-05:00"),
      timezone: business.timezone,
    });
    const { slots } = await service.checkAvailability(business, "haircut", "2026-11-09");
    expect(slots).toContain("2026-11-09T11:30:00-05:00");
    expect(slots).not.toContain("2026-11-09T12:00:00-05:00");
    expect(slots).toContain("2026-11-09T13:00:00-05:00");
  });

  it("books a free slot and queues the calendar sync", async () => {
    const result = await service.book(business, {
      serviceName: "Haircut",
      start: "2026-11-09T10:00",
      customerName: " Maria Lopez ",
      customerPhone: "+12015550199",
      callId: "call_1",
    });

    expect(result.spokenTime).toBe("Monday, November 9 at 10:00 AM");
    expect(repo.appointments).toHaveLength(1);
    expect(repo.appointments[0]).toMatchObject({ customerName: "Maria Lopez", status: "PENDING" });
    expect(queue.jobs).toEqual([{ name: "calendar-sync", payload: { appointmentId: result.appointmentId } }]);
  });

  it("refuses a slot that was already booked", async () => {
    const input = { serviceName: "Haircut", start: "2026-11-09T10:00", customerName: "A", customerPhone: "+1", callId: null };
    await service.book(business, input);
    await expect(service.book(business, { ...input, customerName: "B" })).rejects.toThrow(/no longer available/);
  });

  it("refuses times outside opening hours or in the past", async () => {
    const base = { serviceName: "Haircut", customerName: "A", customerPhone: "+1", callId: null };
    await expect(service.book(business, { ...base, start: "2026-11-09T16:45" })).rejects.toThrow(/outside opening hours/);
    await expect(service.book(business, { ...base, start: "2026-11-07T10:00" })).rejects.toThrow(/already passed/);
  });

  it("matches services loosely and explains what's offered when it can't", async () => {
    await expect(service.checkAvailability(business, "beard", "2026-11-09")).resolves.toMatchObject({ service: "Beard Trim" });
    await expect(service.checkAvailability(business, "manicure", "2026-11-09")).rejects.toBeInstanceOf(BookingError);
    await expect(service.checkAvailability(business, "manicure", "2026-11-09")).rejects.toThrow(/Haircut, Beard Trim/);
  });
});
