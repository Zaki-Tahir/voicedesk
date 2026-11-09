import { GoogleCalendarProvider } from "./google.js";
import { InMemoryCalendarProvider } from "./memory.js";
import type { CalendarProvider } from "./types.js";

export type { CalendarProvider, NewCalendarEvent } from "./types.js";

export function createCalendarProvider(serviceAccountJson?: string): CalendarProvider {
  return serviceAccountJson ? new GoogleCalendarProvider(serviceAccountJson) : new InMemoryCalendarProvider();
}
