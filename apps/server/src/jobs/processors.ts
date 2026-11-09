import type { PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";
import type OpenAI from "openai";
import type { CalendarProvider } from "../calendar/index.js";
import type { SmsSender } from "../notifications/sms.js";
import type { JobName, JobPayloads, JobQueue } from "../queue/jobs.js";
import type { TranscriptEntry } from "../realtime/bridge.js";
import { summarizeCall } from "./summarize.js";

export interface ProcessorDeps {
  db: PrismaClient;
  calendar: CalendarProvider;
  sms: SmsSender;
  queue: JobQueue;
  openai: OpenAI;
  summaryModel: string;
}

export type Processors = { [N in JobName]: (payload: JobPayloads[N]) => Promise<void> };

/**
 * Job handlers. Each one is safe to retry: it checks current state first, so a job that
 * half-succeeded and then retried won't create a second calendar event or a second text.
 */
export function createProcessors(deps: ProcessorDeps): Processors {
  const { db } = deps;

  return {
    async "calendar-sync"({ appointmentId }) {
      const appt = await db.appointment.findUnique({
        where: { id: appointmentId },
        include: { business: true, service: true },
      });
      if (!appt || appt.status !== "PENDING") return;

      let calendarEventId = appt.calendarEventId;
      if (appt.business.calendarId && !calendarEventId) {
        const event = await deps.calendar.createEvent(appt.business.calendarId, {
          summary: `${appt.service.name}: ${appt.customerName}`,
          description: `Booked by phone. Customer phone: ${appt.customerPhone}`,
          start: appt.startsAt,
          end: appt.endsAt,
          timezone: appt.business.timezone,
        });
        calendarEventId = event.id;
      }

      await db.appointment.update({ where: { id: appt.id }, data: { status: "CONFIRMED", calendarEventId } });
      await deps.queue.enqueue("sms-confirmation", { appointmentId: appt.id });
    },

    async "sms-confirmation"({ appointmentId }) {
      const appt = await db.appointment.findUnique({
        where: { id: appointmentId },
        include: { business: true, service: true },
      });
      if (!appt || appt.status !== "CONFIRMED") return;

      const when = DateTime.fromJSDate(appt.startsAt).setZone(appt.business.timezone).toFormat("ccc, LLL d 'at' h:mm a");
      await deps.sms.send(
        appt.customerPhone,
        appt.business.phoneNumber,
        `You're booked at ${appt.business.name}: ${appt.service.name}, ${when}. ` +
          `Need to change it? Call us at ${appt.business.phoneNumber}.`,
      );
    },

    async "call-summary"({ callId }) {
      const call = await db.call.findUnique({ where: { id: callId } });
      if (!call || call.summary) return;
      const summary = await summarizeCall(deps.openai, deps.summaryModel, call.transcript as unknown as TranscriptEntry[]);
      await db.call.update({ where: { id: callId }, data: { summary } });
    },
  };
}

/** Called by the worker when a job has used up all its retries. */
export async function handleExhaustedJob(db: PrismaClient, name: string, payload: unknown): Promise<void> {
  if (name === "calendar-sync") {
    const { appointmentId } = payload as JobPayloads["calendar-sync"];
    await db.appointment.updateMany({ where: { id: appointmentId, status: "PENDING" }, data: { status: "FAILED" } });
  }
}
