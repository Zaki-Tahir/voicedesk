import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import websocket from "@fastify/websocket";
import type { PrismaClient } from "@prisma/client";
import Fastify, { type FastifyServerOptions } from "fastify";
import { type AdminRouteDeps, adminRoutes } from "./routes/admin.js";
import { type TwilioRouteDeps, twilioRoutes } from "./routes/twilio.js";

export interface AppDeps {
  twilio: TwilioRouteDeps;
  /** Omit to run without the admin API (used by the Twilio route tests). */
  admin?: AdminRouteDeps;
  corsOrigin?: string;
  /** Checked by /readyz so the load balancer only routes to instances that can reach the database. */
  db?: Pick<PrismaClient, "$queryRaw">;
}

export async function buildApp(deps: AppDeps, opts: FastifyServerOptions = {}) {
  const app = Fastify({ trustProxy: true, ...opts });

  await app.register(formbody);
  await app.register(websocket);
  if (deps.corsOrigin) await app.register(cors, { origin: deps.corsOrigin });

  app.get("/healthz", async () => ({ ok: true }));
  app.get("/readyz", async (_req, reply) => {
    try {
      if (deps.db) await deps.db.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  await app.register(twilioRoutes, deps.twilio);
  if (deps.admin) await app.register(adminRoutes, { ...deps.admin, prefix: "/api" });

  return app;
}
