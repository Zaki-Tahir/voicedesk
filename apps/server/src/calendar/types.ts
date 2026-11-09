import type { BusyInterval } from "../scheduling/slots.js";

export interface NewCalendarEvent {
  summary: string;
  description: string;
  start: Date;
  end: Date;
  timezone: string;
}

/** The parts of a calendar we need: who's busy, and putting a booking on it. */
export interface CalendarProvider {
  listBusy(calendarId: string, from: Date, to: Date): Promise<BusyInterval[]>;
  createEvent(calendarId: string, event: NewCalendarEvent): Promise<{ id: string }>;
}
