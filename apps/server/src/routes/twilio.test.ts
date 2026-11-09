import twilio from "twilio";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { InMemoryBookingRepository } from "../booking/memory-repository.js";
import { BookingService } from "../booking/service.js";
import type { BusinessProfile } from "../booking/types.js";
import { InMemoryCalendarProvider } from "../calendar/memory.js";
import type { CallRepository } from "../calls/repository.js";
import { weeklyHoursSchema } from "../scheduling/hours.js";

const business: BusinessProfile = {
  id: "biz_1",
  name: "Fade Factory",
  phoneNumber: "+12015550100",
  timezone: "America/New_York",
  greeting: "Thanks for calling!",
  notes: "",
  hours: weeklyHoursSchema.parse({ mon: [["09:00", "17:00"]] }),
  calendarId: null,
  services: [],
};

class FakeCalls implements CallRepository {
  started: { businessId: string; twilioSid: string; fromNumber: string }[] = [];
  async start(input: { businessId: string; twilioSid: string; fromNumber: string }) {
    this.started.push(input);
    return { id: "call_1" };
  }
  async find() {
    return null;
  }
  async finish() {}
}

const AUTH_TOKEN = "test_auth_token";
const PUBLIC_URL = "https://voice.example.com";

async function setup(validateSignature = false) {
  const repo = new InMemoryBookingRepository([business]);
  const queue = { enqueue: async () => {} };
  const calls = new FakeCalls();
  const app = await buildApp({
    twilio: {
      publicUrl: PUBLIC_URL,
      twilioAuthToken: AUTH_TOKEN,
      validateSignature,
      voice: "marin",
      businesses: repo,
      calls,
      booking: new BookingService(repo, new InMemoryCalendarProvider(), queue),
      queue,
      connectRealtime: () => {
        throw new Error("not used");
      },
    },
  });
  return { app, calls };
}

const form = (body: Record<string, string>) => new URLSearchParams(body).toString();
const callBody = { CallSid: "CA123", From: "+12015550199", To: "+12015550100" };

describe("POST /twilio/voice", () => {
  let close: () => Promise<unknown> = async () => {};
  afterEach(() => close());

  it("connects known numbers to the media stream with the call id", async () => {
    const { app, calls } = await setup();
    close = () => app.close();
    const res = await app.inject({
      method: "POST",
      url: "/twilio/voice",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: form(callBody),
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/xml");
    expect(res.body).toContain('<Stream url="wss://voice.example.com/twilio/media">');
    expect(res.body).toContain('<Parameter name="callId" value="call_1"/>');
    expect(calls.started).toEqual([{ businessId: "biz_1", twilioSid: "CA123", fromNumber: "+12015550199" }]);
  });

  it("politely hangs up on numbers that aren't set up", async () => {
    const { app, calls } = await setup();
    close = () => app.close();
    const res = await app.inject({
      method: "POST",
      url: "/twilio/voice",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: form({ ...callBody, To: "+19995550000" }),
    });
    expect(res.body).toContain("<Hangup/>");
    expect(calls.started).toHaveLength(0);
  });

  it("rejects requests without a valid Twilio signature", async () => {
    const { app } = await setup(true);
    close = () => app.close();
    const res = await app.inject({
      method: "POST",
      url: "/twilio/voice",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": "forged" },
      payload: form(callBody),
    });
    expect(res.statusCode).toBe(403);
  });

  it("accepts correctly signed requests", async () => {
    const { app } = await setup(true);
    close = () => app.close();
    const signature = twilio.getExpectedTwilioSignature(AUTH_TOKEN, `${PUBLIC_URL}/twilio/voice`, callBody);
    const res = await app.inject({
      method: "POST",
      url: "/twilio/voice",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": signature },
      payload: form(callBody),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("health checks", () => {
  it("responds on /healthz", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });
});
