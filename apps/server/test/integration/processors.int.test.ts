import type OpenAI from "openai";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { InMemoryCalendarProvider } from "../../src/calendar/memory.js";
import { createProcessors, handleExhaustedJob } from "../../src/jobs/processors.js";
import type { SmsSender } from "../../src/notifications/sms.js";
import type { JobName } from "../../src/queue/jobs.js";
import { createBusiness, db, resetDb } from "./helpers.js";

class FakeSms implements SmsSender {
  sent: { to: string; from: string; body: string }[] = [];
  async send(to: string, from: string, body: string) {
    this.sent.push({ to, from, body });
  }
}

const fakeOpenAI = {
  responses: { create: async () => ({ output_text: " Maria booked a haircut for Monday at 10am. " }) },
} as unknown as OpenAI;

function setup() {
  const calendar = new InMemoryCalendarProvider();
  const sms = new FakeSms();
  const enqueued: { name: JobName; payload: unknown }[] = [];
  const processors = createProcessors({
    db,
    calendar,
    sms,
    openai: fakeOpenAI,
    summaryModel: "test",
    queue: { enqueue: async (name, payload) => void enqueued.push({ name, payload }) },
  });
  return { processors, calendar, sms, enqueued };
}

async function pendingAppointment(calendarId: string | null = "cal_1") {
  const business = await createBusiness({ calendarId });
  return db.appointment.create({
    data: {
      businessId: business.id,
      serviceId: business.services[0]!.id,
      customerName: "Maria Lopez",
      customerPhone: "+12015550199",
      startsAt: new Date("2026-11-09T10:00:00-05:00"),
      endsAt: new Date("2026-11-09T10:30:00-05:00"),
    },
  });
}

describe("job processors", () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it("calendar-sync creates the event once, confirms, and queues the text", async () => {
    const { processors, calendar, enqueued } = setup();
    const appt = await pendingAppointment();

    await processors["calendar-sync"]({ appointmentId: appt.id });
    await processors["calendar-sync"]({ appointmentId: appt.id }); // retry after success is a no-op

    const updated = await db.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(updated.status).toBe("CONFIRMED");
    expect(calendar.events.get("cal_1")).toHaveLength(1);
    expect(calendar.events.get("cal_1")?.[0]?.summary).toBe("Haircut: Maria Lopez");
    expect(enqueued).toEqual([{ name: "sms-confirmation", payload: { appointmentId: appt.id } }]);
  });

  it("confirms without a calendar when the business hasn't connected one", async () => {
    const { processors, calendar } = setup();
    const appt = await pendingAppointment(null);
    await processors["calendar-sync"]({ appointmentId: appt.id });
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe("CONFIRMED");
    expect(calendar.events.size).toBe(0);
  });

  it("sms-confirmation texts the customer from the business number in local time", async () => {
    const { processors, sms } = setup();
    const appt = await pendingAppointment();
    await db.appointment.update({ where: { id: appt.id }, data: { status: "CONFIRMED" } });

    await processors["sms-confirmation"]({ appointmentId: appt.id });

    expect(sms.sent).toEqual([
      {
        to: "+12015550199",
        from: "+12015550100",
        body: "You're booked at Fade Factory: Haircut, Mon, Nov 9 at 10:00 AM. Need to change it? Call us at +12015550100.",
      },
    ]);
  });

  it("marks the appointment failed when calendar sync runs out of retries", async () => {
    const appt = await pendingAppointment();
    await handleExhaustedJob(db, "calendar-sync", { appointmentId: appt.id });
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe("FAILED");
  });

  it("call-summary stores the model's summary", async () => {
    const { processors } = setup();
    const business = await createBusiness();
    const call = await db.call.create({
      data: {
        businessId: business.id,
        twilioSid: "CA1",
        fromNumber: "+12015550199",
        transcript: [{ role: "caller", text: "I'd like a haircut Monday", at: "2026-11-08T15:00:00Z" }],
      },
    });

    await processors["call-summary"]({ callId: call.id });

    expect((await db.call.findUniqueOrThrow({ where: { id: call.id } })).summary).toBe(
      "Maria booked a haircut for Monday at 10am.",
    );
  });
});
