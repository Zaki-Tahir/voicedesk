export const QUEUE_NAME = "voicedesk";

export type JobPayloads = {
  /** Put a newly booked appointment on the business's calendar, then text the caller. */
  "calendar-sync": { appointmentId: string };
  /** SMS confirmation to the caller once the calendar event exists. */
  "sms-confirmation": { appointmentId: string };
  /** Summarize the transcript after the call ends. */
  "call-summary": { callId: string };
};

export type JobName = keyof JobPayloads;

export interface JobQueue {
  enqueue<N extends JobName>(name: N, payload: JobPayloads[N]): Promise<void>;
}

/** Retries with exponential backoff: 5s, 10s, 20s, 40s, 80s. */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 7 * 24 * 3600 },
  removeOnFail: { age: 30 * 24 * 3600 },
} as const;
