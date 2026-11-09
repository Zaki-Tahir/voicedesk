import { z } from "zod";

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:mm");

/** Each day holds zero or more [open, close] ranges, e.g. [["09:00", "12:00"], ["13:00", "17:00"]]. */
const day = z.array(z.tuple([time, time])).default([]);

/** Weekly opening hours. */
export const weeklyHoursSchema = z
  .object({ mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day })
  .superRefine((hours, ctx) => {
    for (const day of WEEKDAYS) {
      for (const [open, close] of hours[day]) {
        if (open >= close) {
          ctx.addIssue({ code: "custom", path: [day], message: `${open}-${close} closes before it opens` });
        }
      }
    }
  });

export type WeeklyHours = z.infer<typeof weeklyHoursSchema>;

/** Luxon weekday (1 = Monday) to our key. */
export function weekdayKey(luxonWeekday: number): Weekday {
  const key = WEEKDAYS[luxonWeekday - 1];
  if (!key) throw new Error(`invalid weekday ${luxonWeekday}`);
  return key;
}
