import type { WeeklyHours } from "../scheduling/hours.js";

export interface ServiceInfo {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number | null;
}

export interface BusinessProfile {
  id: string;
  name: string;
  phoneNumber: string;
  timezone: string;
  greeting: string;
  notes: string;
  hours: WeeklyHours;
  calendarId: string | null;
  services: ServiceInfo[];
}

export interface NewAppointment {
  businessId: string;
  serviceId: string;
  callId: string | null;
  customerName: string;
  customerPhone: string;
  startsAt: Date;
  endsAt: Date;
}

export interface AppointmentRecord extends NewAppointment {
  id: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "FAILED";
}

/** Thrown when two callers race for the same start time. */
export class SlotTakenError extends Error {
  constructor() {
    super("That time was just booked by someone else");
    this.name = "SlotTakenError";
  }
}

export interface BookingRepository {
  findBusinessById(id: string): Promise<BusinessProfile | null>;
  findBusinessByPhone(phoneNumber: string): Promise<BusinessProfile | null>;
  /** Pending and confirmed appointments that overlap [from, to). */
  listActiveAppointments(businessId: string, from: Date, to: Date): Promise<AppointmentRecord[]>;
  /** Inserts a PENDING appointment, or throws SlotTakenError. */
  createPendingAppointment(input: NewAppointment): Promise<AppointmentRecord>;
}
