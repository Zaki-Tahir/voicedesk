import { timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { DateTime } from "luxon";
import { z } from "zod";
import { weeklyHoursSchema } from "../scheduling/hours.js";

export interface AdminRouteDeps {
  db: PrismaClient;
  apiToken: string;
}

const businessPatch = z
  .object({
    name: z.string().min(1).max(120),
    greeting: z.string().min(1).max(300),
    notes: z.string().max(4000),
    timezone: z.string().refine((tz) => DateTime.local().setZone(tz).isValid, "unknown timezone"),
    hours: weeklyHoursSchema,
    calendarId: z.string().nullable(),
  })
  .partial();

const servicesBody = z.object({
  services: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        durationMin: z.number().int().min(5).max(480),
        priceCents: z.number().int().min(0).nullable(),
      }),
    )
    .max(50),
});

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });
const rangeQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** REST API used by the dashboard. All routes require `Authorization: Bearer <ADMIN_API_TOKEN>`. */
export async function adminRoutes(app: FastifyInstance, { db, apiToken }: AdminRouteDeps) {
  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!safeEqual(token, apiToken)) return reply.code(401).send({ error: "unauthorized" });
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) return reply.code(400).send({ error: "invalid request", issues: err.issues });
    throw err;
  });

  async function requireBusiness(id: string, reply: FastifyReply) {
    const business = await db.business.findUnique({ where: { id }, select: { id: true, timezone: true } });
    if (!business) reply.code(404).send({ error: "business not found" });
    return business;
  }

  app.get("/businesses", async () =>
    db.business.findMany({ select: { id: true, name: true, phoneNumber: true }, orderBy: { name: "asc" } }),
  );

  app.get<{ Params: { id: string } }>("/businesses/:id", async (req, reply) => {
    const business = await db.business.findUnique({
      where: { id: req.params.id },
      include: { services: { where: { active: true }, orderBy: { name: "asc" } } },
    });
    return business ?? reply.code(404).send({ error: "business not found" });
  });

  app.patch<{ Params: { id: string } }>("/businesses/:id", async (req, reply) => {
    if (!(await requireBusiness(req.params.id, reply))) return;
    const data = businessPatch.parse(req.body);
    return db.business.update({ where: { id: req.params.id }, data });
  });

  /** Replaces the service list. Removed services are deactivated, not deleted, so old bookings keep their service. */
  app.put<{ Params: { id: string } }>("/businesses/:id/services", async (req, reply) => {
    if (!(await requireBusiness(req.params.id, reply))) return;
    const { services } = servicesBody.parse(req.body);
    const businessId = req.params.id;

    await db.$transaction([
      db.service.updateMany({
        where: { businessId, name: { notIn: services.map((s) => s.name) } },
        data: { active: false },
      }),
      ...services.map((s) =>
        db.service.upsert({
          where: { businessId_name: { businessId, name: s.name } },
          create: { ...s, businessId },
          update: { ...s, active: true },
        }),
      ),
    ]);
    return db.service.findMany({ where: { businessId, active: true }, orderBy: { name: "asc" } });
  });

  app.get<{ Params: { id: string } }>("/businesses/:id/calls", async (req) => {
    const { limit } = listQuery.parse(req.query);
    return db.call.findMany({
      where: { businessId: req.params.id },
      orderBy: { startedAt: "desc" },
      take: limit,
      select: { id: true, fromNumber: true, status: true, startedAt: true, endedAt: true, summary: true },
    });
  });

  app.get<{ Params: { id: string } }>("/calls/:id", async (req, reply) => {
    const call = await db.call.findUnique({
      where: { id: req.params.id },
      include: { appointments: { include: { service: { select: { name: true } } } } },
    });
    return call ?? reply.code(404).send({ error: "call not found" });
  });

  app.get<{ Params: { id: string } }>("/businesses/:id/appointments", async (req, reply) => {
    const business = await requireBusiness(req.params.id, reply);
    if (!business) return;
    const q = rangeQuery.parse(req.query);
    const today = DateTime.now().setZone(business.timezone).startOf("day");
    return db.appointment.findMany({
      where: {
        businessId: business.id,
        startsAt: { gte: q.from ?? today.toJSDate(), lt: q.to ?? today.plus({ days: 14 }).toJSDate() },
      },
      orderBy: { startsAt: "asc" },
      include: { service: { select: { name: true } } },
    });
  });

  /** Numbers for the dashboard's overview cards. */
  app.get<{ Params: { id: string } }>("/businesses/:id/stats", async (req, reply) => {
    const business = await requireBusiness(req.params.id, reply);
    if (!business) return;
    const now = DateTime.now().setZone(business.timezone);
    const dayStart = now.startOf("day").toJSDate();
    const weekStart = now.startOf("week").toJSDate();

    const [callsToday, callsThisWeek, bookedThisWeek, upcoming] = await Promise.all([
      db.call.count({ where: { businessId: business.id, startedAt: { gte: dayStart } } }),
      db.call.count({ where: { businessId: business.id, startedAt: { gte: weekStart } } }),
      db.appointment.count({ where: { businessId: business.id, createdAt: { gte: weekStart }, status: "CONFIRMED" } }),
      db.appointment.count({ where: { businessId: business.id, startsAt: { gte: now.toJSDate() }, status: "CONFIRMED" } }),
    ]);
    return { callsToday, callsThisWeek, bookedThisWeek, upcoming };
  });
}
