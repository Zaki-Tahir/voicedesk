import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import { buildApp } from "./app.js";
import { PrismaBookingRepository } from "./booking/prisma-repository.js";
import { BookingService } from "./booking/service.js";
import { createCalendarProvider } from "./calendar/index.js";
import { PrismaCallRepository } from "./calls/repository.js";
import { loadConfig } from "./config.js";
import { BullJobQueue } from "./queue/bullmq.js";
import { createRealtimeConnector } from "./realtime/openai-socket.js";

const config = loadConfig();
const db = new PrismaClient();
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new BullJobQueue(redis);
const businesses = new PrismaBookingRepository(db);
const booking = new BookingService(businesses, createCalendarProvider(config.GOOGLE_SERVICE_ACCOUNT_JSON), queue);

const app = await buildApp(
  {
    db,
    corsOrigin: config.CORS_ORIGIN,
    admin: { db, apiToken: config.ADMIN_API_TOKEN },
    twilio: {
      publicUrl: config.PUBLIC_URL,
      twilioAuthToken: config.TWILIO_AUTH_TOKEN,
      validateSignature: config.TWILIO_VALIDATE_SIGNATURE,
      voice: config.OPENAI_REALTIME_VOICE,
      businesses,
      calls: new PrismaCallRepository(db),
      booking,
      queue,
      connectRealtime: createRealtimeConnector(config.OPENAI_API_KEY, config.OPENAI_REALTIME_MODEL),
    },
  },
  {
    logger:
      config.NODE_ENV === "development"
        ? { level: config.LOG_LEVEL, transport: { target: "pino-pretty" } }
        : { level: config.LOG_LEVEL },
  },
);

// ECS sends SIGTERM on deploy; stop taking new requests and let in-flight calls finish.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await queue.close();
    await db.$disconnect();
    redis.disconnect();
    process.exit(0);
  });
}

await app.listen({ port: config.PORT, host: config.HOST });
