import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaBookingRepository } from "../../src/booking/prisma-repository.js";
import { BookingService } from "../../src/booking/service.js";
import { InMemoryCalendarProvider } from "../../src/calendar/memory.js";
import { createBusiness, db, resetDb } from "./helpers.js";

const now = () => new Date("2026-11-08T12:00:00-05:00");

describe("booking against Postgres", () => {
  const repo = new PrismaBookingRepository(db);
  const jobs: string[] = [];
  const service = new BookingService(repo, new InMemoryCalendarProvider(), { enqueue: async (n) => void jobs.push(n) }, now);

  beforeEach(async () => {
    await resetDb();
    jobs.length = 0;
  });
  afterAll(() => db.$disconnect());

  it("loads a business by phone number with its hours and services", async () => {
    await createBusiness();
    const business = await repo.findBusinessByPhone("+12015550100");
    expect(business?.services.map((s) => s.name)).toEqual(["Haircut"]);
    expect(business?.hours.mon).toEqual([["09:00", "17:00"]]);
  });

  it("lets only one of two simultaneous callers book the same slot", async () => {
    await createBusiness();
    const business = (await repo.findBusinessByPhone("+12015550100"))!;
    const attempt = (name: string) =>
      service.book(business, { serviceName: "Haircut", start: "2026-11-09T10:00", customerName: name, customerPhone: "+1", callId: null });

    const results = await Promise.allSettled([attempt("First Caller"), attempt("Second Caller")]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await db.appointment.count()).toBe(1);
  });

  it("removes booked time from availability", async () => {
    await createBusiness();
    const business = (await repo.findBusinessByPhone("+12015550100"))!;
    await service.book(business, { serviceName: "Haircut", start: "2026-11-09T10:00", customerName: "A B", customerPhone: "+1", callId: null });

    const { slots } = await service.checkAvailability(business, "Haircut", "2026-11-09");
    expect(slots).not.toContain("2026-11-09T10:00:00-05:00");
    expect(slots).not.toContain("2026-11-09T09:45:00-05:00");
    expect(slots).toContain("2026-11-09T10:30:00-05:00");
    expect(jobs).toEqual(["calendar-sync"]);
  });
});
