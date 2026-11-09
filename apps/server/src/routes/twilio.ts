import type { FastifyInstance, FastifyRequest } from "fastify";
import twilio from "twilio";
import { buildInstructions } from "../agent/instructions.js";
import { createToolHandler } from "../agent/tools.js";
import type { BookingService } from "../booking/service.js";
import type { BookingRepository } from "../booking/types.js";
import type { CallRepository } from "../calls/repository.js";
import type { JobQueue } from "../queue/jobs.js";
import { CallBridge } from "../realtime/bridge.js";
import type { ConnectRealtime } from "../realtime/openai-socket.js";

export interface TwilioRouteDeps {
  publicUrl: string;
  twilioAuthToken?: string;
  validateSignature: boolean;
  voice: string;
  businesses: BookingRepository;
  calls: CallRepository;
  booking: BookingService;
  queue: JobQueue;
  connectRealtime: ConnectRealtime;
}

interface VoiceWebhookBody {
  CallSid: string;
  From: string;
  To: string;
}

const xmlEscape = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

const twiml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;

export async function twilioRoutes(app: FastifyInstance, deps: TwilioRouteDeps) {
  const mediaUrl = `${deps.publicUrl.replace(/^http/, "ws")}/twilio/media`;

  /** Rejects webhooks that weren't signed by Twilio with our auth token. */
  function isFromTwilio(req: FastifyRequest): boolean {
    if (!deps.validateSignature) return true;
    const signature = req.headers["x-twilio-signature"];
    if (!deps.twilioAuthToken || typeof signature !== "string") return false;
    return twilio.validateRequest(
      deps.twilioAuthToken,
      signature,
      `${deps.publicUrl}${req.url}`,
      req.body as Record<string, string>,
    );
  }

  /** Twilio calls this when a call comes in. We answer by connecting the call audio to our WebSocket. */
  app.post<{ Body: VoiceWebhookBody }>("/twilio/voice", async (req, reply) => {
    if (!isFromTwilio(req)) return reply.code(403).send("invalid signature");
    reply.type("text/xml");

    const business = await deps.businesses.findBusinessByPhone(req.body.To);
    if (!business) {
      req.log.warn({ to: req.body.To }, "call to unknown number");
      return twiml("<Say>Sorry, this number is not set up yet. Goodbye.</Say><Hangup/>");
    }

    const call = await deps.calls.start({ businessId: business.id, twilioSid: req.body.CallSid, fromNumber: req.body.From });
    return twiml(
      `<Connect><Stream url="${xmlEscape(mediaUrl)}"><Parameter name="callId" value="${xmlEscape(call.id)}"/></Stream></Connect>`,
    );
  });

  /** Twilio Media Stream for one call. */
  app.get("/twilio/media", { websocket: true }, (socket, req) => {
    let bridge: CallBridge | null = null;
    const early: unknown[] = [];

    const twilioSocket = {
      send: (m: object) => socket.readyState === socket.OPEN && socket.send(JSON.stringify(m)),
      close: () => socket.close(),
    };

    socket.on("message", async (raw: Buffer) => {
      const msg = JSON.parse(raw.toString());
      if (bridge) return bridge.handleTwilioMessage(msg);
      if (msg.event !== "start") return void early.push(msg);

      const callId: string | undefined = msg.start.customParameters?.callId;
      const call = callId ? await deps.calls.find(callId) : null;
      const business = call ? await deps.businesses.findBusinessById(call.businessId) : null;
      if (!call || !business) {
        req.log.error({ callId }, "media stream for unknown call");
        return socket.close();
      }

      const log = req.log.child({ callId: call.id, businessId: business.id });
      const openai = deps.connectRealtime();
      bridge = new CallBridge(twilioSocket, openai, {
        instructions: buildInstructions(business),
        greeting: business.greeting,
        voice: deps.voice,
        tools: createToolHandler({ business, booking: deps.booking, callId: call.id, callerNumber: call.fromNumber }),
        log,
        onEnd: async (transcript) => {
          log.info({ turns: transcript.length }, "call ended");
          await deps.calls.finish(call.id, transcript);
          await deps.queue.enqueue("call-summary", { callId: call.id });
        },
      });

      const b = bridge;
      openai.onEvent((event) => b.handleRealtimeEvent(event).catch((err) => log.error({ err }, "realtime handler failed")));
      openai.onClose(() => b.end());
      b.start();
      b.handleTwilioMessage(msg);
      for (const m of early.splice(0)) b.handleTwilioMessage(m as never);
    });

    socket.on("close", () => bridge?.end());
  });
}
