import { DateTime } from "luxon";
import type { BusinessProfile } from "../booking/types.js";
import { WEEKDAYS } from "../scheduling/hours.js";

const DAY_NAMES: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export function describeHours(business: BusinessProfile): string {
  return WEEKDAYS.map((d) => {
    const ranges = business.hours[d];
    const text = ranges.length ? ranges.map(([o, c]) => `${o}-${c}`).join(", ") : "closed";
    return `${DAY_NAMES[d]}: ${text}`;
  }).join("\n");
}

export function describeServices(business: BusinessProfile): string {
  return business.services
    .map((s) => {
      const price = s.priceCents != null ? `, $${(s.priceCents / 100).toFixed(2)}` : "";
      return `- ${s.name} (${s.durationMin} min${price})`;
    })
    .join("\n");
}

/** System instructions for the voice agent, rebuilt for every call so "today" is always right. */
export function buildInstructions(business: BusinessProfile, now: Date = new Date()): string {
  const today = DateTime.fromJSDate(now).setZone(business.timezone);
  const notes = business.notes ? `\nOther things to know:\n${business.notes}\n` : "";

  return `You are the receptionist answering the phone for ${business.name}.

Today is ${today.toFormat("cccc, LLLL d, yyyy")} and the local time is ${today.toFormat("h:mm a")} (${business.timezone}).

How to talk:
- This is a phone call. Keep replies short: one or two sentences, then let the caller speak.
- Sound warm and natural. Never read out lists longer than three items; offer a few options and ask.
- Say times the way people do ("two thirty", "tomorrow at ten"), never ISO timestamps.
- If you don't know something, say so and offer to take a message. Never invent prices, policies or availability.

Booking:
1. Find out which service they want and roughly when.
2. Call check_availability for that day before offering any time. Offer two or three of the returned slots.
3. Once they pick one, get their first and last name. Confirm the service, day and time back to them.
4. Only after they say yes, call book_appointment. Tell them they'll get a text confirmation.
If a tool returns an error, explain it simply and offer an alternative.

Opening hours:
${describeHours(business)}

Services:
${describeServices(business)}
${notes}`;
}
