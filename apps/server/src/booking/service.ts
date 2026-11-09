import { DateTime } from "luxon";
import type { CalendarProvider } from "../calendar/index.js";
import type { JobQueue } from "../queue/jobs.js";
import { findOpenSlots, isWithinHours } from "../scheduling/slots.js";
import { type BookingRepository, type BusinessProfile, type ServiceInfo, SlotTakenError } from "./types.js";

export class BookingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingError";
  }
}

export interface Availability {
  service: string;
  date: string;
  slots: string[];
}

export interface BookingConfirmation {
  appointmentId: string;
  service: string;
  start: string;
  spokenTime: string;
}

export class BookingService {
  constructor(
    private readonly repo: BookingRepository,
    private readonly calendar: CalendarProvider,
    private readonly queue: JobQueue,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async checkAvailability(business: BusinessProfile, serviceName: string, date: string): Promise<Availability> {
    const service = findService(business, serviceName);
    const day = DateTime.fromISO(date, { zone: business.timezone });
    if (!day.isValid) throw new BookingError(`"${date}" is not a valid date`);

    const from = day.startOf("day").toJSDate();
    const to = day.endOf("day").toJSDate();
    const busy = await this.busyBetween(business, from, to);

    const slots = findOpenSlots({
      date: day.toISODate()!,
      timezone: business.timezone,
      hours: business.hours,
      durationMin: service.durationMin,
      busy,
      now: this.clock(),
    });
    return { service: service.name, date: day.toISODate()!, slots };
  }

  async book(
    business: BusinessProfile,
    input: { serviceName: string; start: string; customerName: string; customerPhone: string; callId: string | null },
  ): Promise<BookingConfirmation> {
    const service = findService(business, input.serviceName);
    const start = DateTime.fromISO(input.start, { zone: business.timezone });
    if (!start.isValid) throw new BookingError(`"${input.start}" is not a valid time`);
    if (start.toJSDate() <= this.clock()) throw new BookingError("That time has already passed");
    if (!isWithinHours(start, service.durationMin, business.hours)) {
      throw new BookingError("That time is outside opening hours");
    }

    const end = start.plus({ minutes: service.durationMin });
    const busy = await this.busyBetween(business, start.toJSDate(), end.toJSDate());
    if (busy.length > 0) throw new BookingError("That time is no longer available");

    let appointment;
    try {
      appointment = await this.repo.createPendingAppointment({
        businessId: business.id,
        serviceId: service.id,
        callId: input.callId,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone,
        startsAt: start.toJSDate(),
        endsAt: end.toJSDate(),
      });
    } catch (err) {
      if (err instanceof SlotTakenError) throw new BookingError("That time is no longer available");
      throw err;
    }

    // Calendar write and SMS happen in the worker so a slow Google API never stalls the call.
    await this.queue.enqueue("calendar-sync", { appointmentId: appointment.id });

    return {
      appointmentId: appointment.id,
      service: service.name,
      start: start.toISO({ suppressMilliseconds: true })!,
      spokenTime: start.toFormat("cccc, LLLL d 'at' h:mm a"),
    };
  }

  /** Busy time = our own pending/confirmed bookings + whatever is on the business calendar. */
  private async busyBetween(business: BusinessProfile, from: Date, to: Date) {
    const [appointments, calendarBusy] = await Promise.all([
      this.repo.listActiveAppointments(business.id, from, to),
      business.calendarId ? this.calendar.listBusy(business.calendarId, from, to) : Promise.resolve([]),
    ]);
    return [...appointments.map((a) => ({ start: a.startsAt, end: a.endsAt })), ...calendarBusy];
  }
}

function findService(business: BusinessProfile, name: string): ServiceInfo {
  const wanted = name.trim().toLowerCase();
  const service =
    business.services.find((s) => s.name.toLowerCase() === wanted) ??
    business.services.find((s) => s.name.toLowerCase().includes(wanted) || wanted.includes(s.name.toLowerCase()));
  if (!service) {
    throw new BookingError(`We don't offer "${name}". Available: ${business.services.map((s) => s.name).join(", ")}`);
  }
  return service;
}
