import { DateTime, Interval } from "luxon";
import { type WeeklyHours, weekdayKey } from "./hours.js";

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface SlotQuery {
  /** Calendar day in the business's timezone, YYYY-MM-DD. */
  date: string;
  timezone: string;
  hours: WeeklyHours;
  durationMin: number;
  busy: BusyInterval[];
  /** Slots start on this grid, e.g. every 15 minutes. */
  stepMin?: number;
  /** Don't offer slots that start sooner than this from `now`. */
  minNoticeMin?: number;
  now?: Date;
}

/**
 * Returns the start times (as ISO strings in the business timezone) of every slot on `date`
 * that fits inside opening hours and doesn't overlap anything already booked.
 */
export function findOpenSlots(q: SlotQuery): string[] {
  const step = q.stepMin ?? 15;
  const day = DateTime.fromISO(q.date, { zone: q.timezone });
  if (!day.isValid) throw new Error(`invalid date ${q.date}`);

  const earliest = DateTime.fromJSDate(q.now ?? new Date()).plus({ minutes: q.minNoticeMin ?? 60 });
  const busy = q.busy.map((b) => Interval.fromDateTimes(DateTime.fromJSDate(b.start), DateTime.fromJSDate(b.end)));
  const ranges = q.hours[weekdayKey(day.weekday)] ?? [];

  const slots: string[] = [];
  for (const [open, close] of ranges) {
    const opensAt = atTime(day, open);
    const closesAt = atTime(day, close);

    for (let start = opensAt; start.plus({ minutes: q.durationMin }) <= closesAt; start = start.plus({ minutes: step })) {
      if (start < earliest) continue;
      const slot = Interval.fromDateTimes(start, start.plus({ minutes: q.durationMin }));
      if (busy.some((b) => b.overlaps(slot))) continue;
      slots.push(start.toISO({ suppressMilliseconds: true })!);
    }
  }
  return slots;
}

/** True when [start, start + duration) is inside opening hours on that day. */
export function isWithinHours(start: DateTime, durationMin: number, hours: WeeklyHours): boolean {
  const end = start.plus({ minutes: durationMin });
  const ranges = hours[weekdayKey(start.weekday)] ?? [];
  return ranges.some(([open, close]) => start >= atTime(start, open) && end <= atTime(start, close));
}

function atTime(day: DateTime, hhmm: string): DateTime {
  const [h, m] = hhmm.split(":").map(Number);
  return day.set({ hour: h, minute: m, second: 0, millisecond: 0 });
}
