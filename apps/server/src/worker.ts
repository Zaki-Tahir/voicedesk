import { PrismaClient } from "@prisma/client";
import { type Job, Worker } from "bullmq";
import { Redis } from "ioredis";
import OpenAI from "openai";
import { createCalendarProvider } from "./calendar/index.js";
import { loadConfig } from "./config.js";
import { createProcessors, handleExhaustedJob } from "./jobs/processors.js";
import { ConsoleSmsSender, TwilioSmsSender } from "./notifications/sms.js";
import { BullJobQueue } from "./queue/bullmq.js";
import { type JobName, QUEUE_NAME } from "./queue/jobs.js";

const config = loadConfig();
const db = new PrismaClient();
// BullMQ workers need maxRetriesPerRequest: null so blocking commands aren't cut off.
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new BullJobQueue(redis);

const processors = createProcessors({
  db,
  queue,
  calendar: createCalendarProvider(config.GOOGLE_SERVICE_ACCOUNT_JSON),
  sms:
    config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN
      ? new TwilioSmsSender(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
      : new ConsoleSmsSender(),
  openai: new OpenAI({ apiKey: config.OPENAI_API_KEY }),
  summaryModel: config.OPENAI_SUMMARY_MODEL,
});

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    const handler = processors[job.name as JobName] as ((payload: unknown) => Promise<void>) | undefined;
    if (!handler) throw new Error(`No handler for job ${job.name}`);
    await handler(job.data);
  },
  { connection: redis, concurrency: 10 },
);

worker.on("completed", (job) => console.log(JSON.stringify({ level: "info", msg: "job done", job: job.name, id: job.id })));
worker.on("failed", async (job, err) => {
  if (!job) return;
  const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
  console.error(JSON.stringify({ level: "error", msg: "job failed", job: job.name, id: job.id, exhausted, err: err.message }));
  if (exhausted) await handleExhaustedJob(db, job.name, job.data);
});

async function shutdown() {
  await worker.close();
  await queue.close();
  await db.$disconnect();
  redis.disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log(JSON.stringify({ level: "info", msg: "worker started", queue: QUEUE_NAME }));
