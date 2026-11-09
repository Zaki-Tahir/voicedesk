import type { PrismaClient } from "@prisma/client";
import type { TranscriptEntry } from "../realtime/bridge.js";

export interface CallRepository {
  start(input: { businessId: string; twilioSid: string; fromNumber: string }): Promise<{ id: string }>;
  find(id: string): Promise<{ id: string; businessId: string; fromNumber: string } | null>;
  finish(id: string, transcript: TranscriptEntry[], failed?: boolean): Promise<void>;
}

export class PrismaCallRepository implements CallRepository {
  constructor(private readonly db: PrismaClient) {}

  async start(input: { businessId: string; twilioSid: string; fromNumber: string }) {
    // Twilio retries webhooks, so the same CallSid may arrive twice.
    return this.db.call.upsert({
      where: { twilioSid: input.twilioSid },
      create: input,
      update: {},
      select: { id: true },
    });
  }

  find(id: string) {
    return this.db.call.findUnique({ where: { id }, select: { id: true, businessId: true, fromNumber: true } });
  }

  async finish(id: string, transcript: TranscriptEntry[], failed = false) {
    await this.db.call.update({
      where: { id },
      data: { endedAt: new Date(), transcript: transcript as object[], status: failed ? "FAILED" : "COMPLETED" },
    });
  }
}
