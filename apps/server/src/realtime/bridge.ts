import type { ToolHandler } from "../agent/tools.js";
import { toolDefinitions } from "../agent/tools.js";

/** Minimal socket surface so the bridge can be driven by fakes in tests. */
export interface JsonSocket {
  send(message: object): void;
  close(): void;
}

export interface TranscriptEntry {
  role: "caller" | "agent";
  text: string;
  at: string;
}

export interface BridgeOptions {
  instructions: string;
  greeting: string;
  voice: string;
  tools: ToolHandler;
  /** Called once when either side hangs up. */
  onEnd: (transcript: TranscriptEntry[]) => void;
  log?: { info: (obj: object, msg?: string) => void; error: (obj: object, msg?: string) => void };
  now?: () => Date;
}

/** Twilio Media Streams message shapes we care about. */
type TwilioMessage =
  | { event: "connected" }
  | { event: "start"; start: { streamSid: string; callSid: string; customParameters?: Record<string, string> } }
  | { event: "media"; media: { payload: string; timestamp: string } }
  | { event: "mark"; mark: { name: string } }
  | { event: "stop" };

type RealtimeEvent = { type: string; [key: string]: unknown };

/**
 * Connects one phone call to one OpenAI Realtime session.
 *
 * Audio flows in both directions as 8kHz G.711 mu-law, which both Twilio and the Realtime API
 * speak natively, so no transcoding is needed. The bridge also handles barge-in: when the caller
 * starts talking over the agent, it stops playback on Twilio and tells the model how much of its
 * reply was actually heard, so the conversation history matches what the caller experienced.
 */
export class CallBridge {
  private streamSid: string | null = null;
  private latestMediaTimestamp = 0;
  /** The agent audio item currently playing, and when (in stream time) it started. */
  private playing: { itemId: string; startedAt: number } | null = null;
  private pendingMarks: string[] = [];
  private readonly transcript: TranscriptEntry[] = [];
  private ended = false;

  constructor(
    private readonly twilio: JsonSocket,
    private readonly openai: JsonSocket,
    private readonly opts: BridgeOptions,
  ) {}

  /** Call once the OpenAI socket is open. */
  start(): void {
    this.openai.send({
      type: "session.update",
      session: {
        type: "realtime",
        instructions: this.opts.instructions,
        output_modalities: ["audio"],
        audio: {
          input: {
            format: { type: "audio/pcmu" },
            turn_detection: { type: "server_vad", silence_duration_ms: 500 },
            transcription: { model: "gpt-4o-mini-transcribe" },
            noise_reduction: { type: "near_field" },
          },
          output: { format: { type: "audio/pcmu" }, voice: this.opts.voice },
        },
        tools: toolDefinitions,
        tool_choice: "auto",
      },
    });
    // Have the agent speak first instead of waiting in silence.
    this.openai.send({
      type: "response.create",
      response: { instructions: `Greet the caller with: "${this.opts.greeting}" then ask how you can help.` },
    });
  }

  handleTwilioMessage(msg: TwilioMessage): void {
    switch (msg.event) {
      case "start":
        this.streamSid = msg.start.streamSid;
        this.latestMediaTimestamp = 0;
        break;
      case "media":
        this.latestMediaTimestamp = Number(msg.media.timestamp);
        this.openai.send({ type: "input_audio_buffer.append", audio: msg.media.payload });
        break;
      case "mark":
        this.pendingMarks.shift();
        break;
      case "stop":
        this.end();
        break;
    }
  }

  async handleRealtimeEvent(event: RealtimeEvent): Promise<void> {
    switch (event.type) {
      case "response.output_audio.delta": {
        if (!this.streamSid) return;
        this.twilio.send({ event: "media", streamSid: this.streamSid, media: { payload: event.delta as string } });
        const itemId = event.item_id as string;
        if (this.playing?.itemId !== itemId) {
          this.playing = { itemId, startedAt: this.latestMediaTimestamp };
        }
        // Marks come back from Twilio once audio has actually been played to the caller.
        this.twilio.send({ event: "mark", streamSid: this.streamSid, mark: { name: "agent" } });
        this.pendingMarks.push("agent");
        break;
      }

      case "input_audio_buffer.speech_started":
        this.interrupt();
        break;

      case "conversation.item.input_audio_transcription.completed":
        this.record("caller", event.transcript as string);
        break;

      case "response.output_audio_transcript.done":
        this.record("agent", event.transcript as string);
        break;

      case "response.function_call_arguments.done": {
        const output = await this.opts.tools(event.name as string, event.arguments as string);
        this.opts.log?.info({ tool: event.name, output }, "tool call");
        this.openai.send({
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: event.call_id, output },
        });
        this.openai.send({ type: "response.create" });
        break;
      }

      case "error":
        this.opts.log?.error({ event }, "realtime api error");
        break;
    }
  }

  /** Caller talked over the agent: stop playback and trim what the model thinks it said. */
  private interrupt(): void {
    if (!this.playing || this.pendingMarks.length === 0 || !this.streamSid) return;
    const heardMs = Math.max(0, this.latestMediaTimestamp - this.playing.startedAt);
    this.openai.send({
      type: "conversation.item.truncate",
      item_id: this.playing.itemId,
      content_index: 0,
      audio_end_ms: heardMs,
    });
    this.twilio.send({ event: "clear", streamSid: this.streamSid });
    this.playing = null;
    this.pendingMarks = [];
  }

  private record(role: TranscriptEntry["role"], text: string | undefined): void {
    const clean = text?.trim();
    if (clean) this.transcript.push({ role, text: clean, at: (this.opts.now?.() ?? new Date()).toISOString() });
  }

  /** Safe to call more than once (both sockets closing will each trigger it). */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.openai.close();
    this.opts.onEnd([...this.transcript]);
  }
}
