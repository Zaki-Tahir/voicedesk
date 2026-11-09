import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { InMemoryBookingRepository } from "../../src/booking/memory-repository.js";
import { BookingService } from "../../src/booking/service.js";
import { InMemoryCalendarProvider } from "../../src/calendar/memory.js";
import { createBusiness, db, resetDb } from "./helpers.js";

const TOKEN = "integration-test-token-123456";
const auth = { authorization: `Bearer ${TOKEN}` };

describe("admin API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    const repo = new InMemoryBookingRepository([]);
    const queue = { enqueue: async () => {} };
    app = await buildApp({
      db,
      admin: { db, apiToken: TOKEN },
      twilio: {
        publicUrl: "https://example.com",
        validateSignature: false,
        voice: "marin",
        businesses: repo,
        calls: { start: async () => ({ id: "x" }), find: async () => null, finish: async () => {} },
        booking: new BookingService(repo, new InMemoryCalendarProvider(), queue),
        queue,
        connectRealtime: () => {
          throw new Error("unused");
        },
      },
    });
  });
  beforeEach(resetDb);
  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  it("requires the bearer token", async () => {
    expect((await app.inject({ method: "GET", url: "/api/businesses" })).statusCode).toBe(401);
    const wrong = await app.inject({ method: "GET", url: "/api/businesses", headers: { authorization: "Bearer nope" } });
    expect(wrong.statusCode).toBe(401);
  });

  it("reports readiness when the database is reachable", async () => {
    expect((await app.inject({ method: "GET", url: "/readyz" })).json()).toEqual({ ok: true });
  });

  it("updates settings and rejects invalid hours", async () => {
    const business = await createBusiness();
    const ok = await app.inject({
      method: "PATCH",
      url: `/api/businesses/${business.id}`,
      headers: auth,
      payload: { greeting: "Hey there!", hours: { sat: [["10:00", "14:00"]] } },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().hours.sat).toEqual([["10:00", "14:00"]]);

    const bad = await app.inject({
      method: "PATCH",
      url: `/api/businesses/${business.id}`,
      headers: auth,
      payload: { hours: { mon: [["18:00", "09:00"]] } },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("replaces services and keeps removed ones for old bookings", async () => {
    const business = await createBusiness();
    const res = await app.inject({
      method: "PUT",
      url: `/api/businesses/${business.id}/services`,
      headers: auth,
      payload: { services: [{ name: "Beard Trim", durationMin: 15, priceCents: 1500 }] },
    });

    expect(res.json().map((s: { name: string }) => s.name)).toEqual(["Beard Trim"]);
    const haircut = await db.service.findFirstOrThrow({ where: { name: "Haircut" } });
    expect(haircut.active).toBe(false);
  });

  it("returns 404 for unknown businesses", async () => {
    const res = await app.inject({ method: "GET", url: "/api/businesses/nope/stats", headers: auth });
    expect(res.statusCode).toBe(404);
  });
});
