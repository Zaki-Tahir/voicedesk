import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { DEFAULT_JOB_OPTIONS, type JobName, type JobPayloads, type JobQueue, QUEUE_NAME } from "./jobs.js";

export class BullJobQueue implements JobQueue {
  private readonly queue: Queue;

  constructor(connection: Redis) {
    this.queue = new Queue(QUEUE_NAME, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
  }

  async enqueue<N extends JobName>(name: N, payload: JobPayloads[N]): Promise<void> {
    // A stable job id makes enqueueing idempotent if a handler retries.
    const id = `${name}:${Object.values(payload).join(":")}`;
    await this.queue.add(name, payload, { jobId: id });
  }

  close(): Promise<void> {
    return this.queue.close();
  }
}
