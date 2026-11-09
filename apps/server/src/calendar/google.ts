import { auth, calendar, type calendar_v3 } from "@googleapis/calendar";
import type { BusyInterval } from "../scheduling/slots.js";
import type { CalendarProvider, NewCalendarEvent } from "./types.js";

/**
 * Google Calendar via a service account. Each business shares its calendar with the
 * service account's email and stores the calendar ID on the Business row.
 */
export class GoogleCalendarProvider implements CalendarProvider {
  private readonly api: calendar_v3.Calendar;

  constructor(serviceAccountJson: string) {
    const key = JSON.parse(serviceAccountJson) as { client_email: string; private_key: string };
    const jwt = new auth.JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    this.api = calendar({ version: "v3", auth: jwt });
  }

  async listBusy(calendarId: string, from: Date, to: Date): Promise<BusyInterval[]> {
    const res = await this.api.freebusy.query({
      requestBody: { timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: calendarId }] },
    });
    const busy = res.data.calendars?.[calendarId]?.busy ?? [];
    return busy
      .filter((b): b is { start: string; end: string } => Boolean(b.start && b.end))
      .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  }

  async createEvent(calendarId: string, event: NewCalendarEvent): Promise<{ id: string }> {
    const res = await this.api.events.insert({
      calendarId,
      requestBody: {
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.start.toISOString(), timeZone: event.timezone },
        end: { dateTime: event.end.toISOString(), timeZone: event.timezone },
      },
    });
    if (!res.data.id) throw new Error("Google Calendar did not return an event id");
    return { id: res.data.id };
  }
}
