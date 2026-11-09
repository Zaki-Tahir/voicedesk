import { Prisma, type PrismaClient } from "@prisma/client";
import { weeklyHoursSchema } from "../scheduling/hours.js";
import {
  type AppointmentRecord,
  type BookingRepository,
  type BusinessProfile,
  type NewAppointment,
  SlotTakenError,
} from "./types.js";

const businessInclude = { services: { where: { active: true }, orderBy: { name: "asc" } } } as const;
type BusinessRow = Prisma.BusinessGetPayload<{ include: typeof businessInclude }>;

export function toBusinessProfile(row: BusinessRow): BusinessProfile {
  return {
    id: row.id,
    name: row.name,
    phoneNumber: row.phoneNumber,
    timezone: row.timezone,
    greeting: row.greeting,
    notes: row.notes,
    hours: weeklyHoursSchema.parse(row.hours),
    calendarId: row.calendarId,
    services: row.services.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin, priceCents: s.priceCents })),
  };
}

export class PrismaBookingRepository implements BookingRepository {
  constructor(private readonly db: PrismaClient) {}

  async findBusinessById(id: string) {
    const row = await this.db.business.findUnique({ where: { id }, include: businessInclude });
    return row ? toBusinessProfile(row) : null;
  }

  async findBusinessByPhone(phoneNumber: string) {
    const row = await this.db.business.findUnique({ where: { phoneNumber }, include: businessInclude });
    return row ? toBusinessProfile(row) : null;
  }

  async listActiveAppointments(businessId: string, from: Date, to: Date): Promise<AppointmentRecord[]> {
    return this.db.appointment.findMany({
      where: {
        businessId,
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
      orderBy: { startsAt: "asc" },
    });
  }

  async createPendingAppointment(input: NewAppointment): Promise<AppointmentRecord> {
    try {
      return await this.db.appointment.create({ data: { ...input, status: "PENDING" } });
    } catch (err) {
      // Unique (businessId, startsAt): another call grabbed this slot a moment ago.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new SlotTakenError();
      throw err;
    }
  }
}
