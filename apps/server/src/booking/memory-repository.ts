import { randomUUID } from "node:crypto";
import {
  type AppointmentRecord,
  type BookingRepository,
  type BusinessProfile,
  type NewAppointment,
  SlotTakenError,
} from "./types.js";

/** In-memory repository for unit tests. Mirrors the Postgres unique constraint on (businessId, startsAt). */
export class InMemoryBookingRepository implements BookingRepository {
  readonly appointments: AppointmentRecord[] = [];

  constructor(private readonly businesses: BusinessProfile[]) {}

  async findBusinessById(id: string) {
    return this.businesses.find((b) => b.id === id) ?? null;
  }

  async findBusinessByPhone(phoneNumber: string) {
    return this.businesses.find((b) => b.phoneNumber === phoneNumber) ?? null;
  }

  async listActiveAppointments(businessId: string, from: Date, to: Date) {
    return this.appointments.filter(
      (a) => a.businessId === businessId && a.status !== "CANCELLED" && a.status !== "FAILED" && a.startsAt < to && a.endsAt > from,
    );
  }

  async createPendingAppointment(input: NewAppointment) {
    if (this.appointments.some((a) => a.businessId === input.businessId && a.startsAt.getTime() === input.startsAt.getTime())) {
      throw new SlotTakenError();
    }
    const record: AppointmentRecord = { ...input, id: randomUUID(), status: "PENDING" };
    this.appointments.push(record);
    return record;
  }
}
