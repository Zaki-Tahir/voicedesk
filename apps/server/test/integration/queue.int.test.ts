import { type Job, Worker } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { BullJobQueue } from "../../src/queue/bullmq.js";
import { QUEUE_NAME } from "../../src/queue/jobs.js";
import { REDIS_URL } from "./helpers.js";

describe("BullMQ queue", () => {
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new BullJobQueue(redis);

  afterAll(async () => {
    await queue.close();
    redis.disconnect();
  });

  it("delivers jobs to a worker and ignores duplicate enqueues", async () => {
    await redis.flushdb();
    const seen: Job[] = [];
    const done = new Promise<void>((resolve) => {
      const worker = new Worker(
        QUEUE_NAME,
        async (job) => {
          seen.push(job);
          // Give the duplicate a chance to show up before we stop.
          setTimeout(() => worker.close().then(resolve), 300);
        },
        { connection: redis },
      );
    });

    await queue.enqueue("call-summary", { callId: "call_42" });
    await queue.enqueue("call-summary", { callId: "call_42" });
    await done;

    expect(seen).toHaveLength(1);
    expect(seen[0]?.name).toBe("call-summary");
    expect(seen[0]?.data).toEqual({ callId: "call_42" });
    expect(seen[0]?.opts.attempts).toBe(5);
  });
});
