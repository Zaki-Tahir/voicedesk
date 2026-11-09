import { randomUUID } from "node:crypto";
import type { BusyInterval } from "../scheduling/slots.js";
import type { CalendarProvider, NewCalendarEvent } from "./types.js";

/** Used in local development and tests when no Google credentials are configured. */
export class InMemoryCalendarProvider implements CalendarProvider {
  readonly events = new Map<string, (NewCalendarEvent & { id: string })[]>();

  async listBusy(calendarId: string, from: Date, to: Date): Promise<BusyInterval[]> {
    return (this.events.get(calendarId) ?? [])
      .filter((e) => e.start < to && e.end > from)
      .map((e) => ({ start: e.start, end: e.end }));
  }

  async createEvent(calendarId: string, event: NewCalendarEvent): Promise<{ id: string }> {
    const id = randomUUID();
    this.events.set(calendarId, [...(this.events.get(calendarId) ?? []), { ...event, id }]);
    return { id };
  }
}
