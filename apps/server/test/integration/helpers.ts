import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL?.includes("test")) {
  // These tests truncate every table. Refuse to run against anything that isn't clearly a test database.
  throw new Error("Integration tests need DATABASE_URL pointing at a database with 'test' in its name");
}

export const db = new PrismaClient();
export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379/1";

export async function resetDb() {
  await db.$executeRawUnsafe(`TRUNCATE "Appointment", "Call", "Service", "Business" RESTART IDENTITY CASCADE`);
}

const weekday = [["09:00", "17:00"]];

export async function createBusiness(overrides: { calendarId?: string | null; phoneNumber?: string } = {}) {
  return db.business.create({
    data: {
      name: "Fade Factory",
      phoneNumber: overrides.phoneNumber ?? "+12015550100",
      timezone: "America/New_York",
      greeting: "Thanks for calling!",
      calendarId: overrides.calendarId === undefined ? "cal_1" : overrides.calendarId,
      hours: { mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday, sat: [], sun: [] },
      services: { create: [{ name: "Haircut", durationMin: 30, priceCents: 3500 }] },
    },
    include: { services: true },
  });
}
