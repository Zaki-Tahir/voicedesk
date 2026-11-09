import { describe, expect, it, vi } from "vitest";
import { CallBridge, type JsonSocket, type TranscriptEntry } from "./bridge.js";

class FakeSocket implements JsonSocket {
  sent: Record<string, unknown>[] = [];
  closed = false;
  send(message: object) {
    this.sent.push(message as Record<string, unknown>);
  }
  close() {
    this.closed = true;
  }
  ofType(type: string) {
    return this.sent.filter((m) => m.type === type || m.event === type);
  }
}

function setup(tools = vi.fn(async () => JSON.stringify({ ok: true }))) {
  const twilio = new FakeSocket();
  const openai = new FakeSocket();
  let transcript: TranscriptEntry[] | null = null;
  const bridge = new CallBridge(twilio, openai, {
    instructions: "be nice",
    greeting: "Thanks for calling!",
    voice: "marin",
    tools,
    onEnd: (t) => (transcript = t),
    now: () => new Date("2026-11-09T15:00:00Z"),
  });
  bridge.start();
  bridge.handleTwilioMessage({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } });
  return { bridge, twilio, openai, tools, getTranscript: () => transcript };
}

describe("CallBridge", () => {
  it("configures the session for phone audio and greets first", () => {
    const { openai } = setup();
    const update = openai.ofType("session.update")[0] as { session: { audio: { input: { format: unknown } } } };
    expect(update.session.audio.input.format).toEqual({ type: "audio/pcmu" });
    expect(openai.ofType("response.create")).toHaveLength(1);
  });

  it("forwards audio in both directions", async () => {
    const { bridge, twilio, openai } = setup();
    bridge.handleTwilioMessage({ event: "media", media: { payload: "CALLER", timestamp: "100" } });
    expect(openai.ofType("input_audio_buffer.append")[0]).toMatchObject({ audio: "CALLER" });

    await bridge.handleRealtimeEvent({ type: "response.output_audio.delta", delta: "AGENT", item_id: "item_1" });
    expect(twilio.ofType("media")[0]).toEqual({ event: "media", streamSid: "MZ1", media: { payload: "AGENT" } });
  });

  it("stops playback and truncates the reply when the caller interrupts", async () => {
    const { bridge, twilio, openai } = setup();
    bridge.handleTwilioMessage({ event: "media", media: { payload: "x", timestamp: "1000" } });
    await bridge.handleRealtimeEvent({ type: "response.output_audio.delta", delta: "a", item_id: "item_1" });
    bridge.handleTwilioMessage({ event: "media", media: { payload: "x", timestamp: "2400" } });

    await bridge.handleRealtimeEvent({ type: "input_audio_buffer.speech_started" });

    expect(openai.ofType("conversation.item.truncate")[0]).toMatchObject({ item_id: "item_1", audio_end_ms: 1400 });
    expect(twilio.ofType("clear")).toHaveLength(1);
  });

  it("does nothing on speech_started when the agent isn't talking", async () => {
    const { bridge, twilio, openai } = setup();
    await bridge.handleRealtimeEvent({ type: "input_audio_buffer.speech_started" });
    expect(openai.ofType("conversation.item.truncate")).toHaveLength(0);
    expect(twilio.ofType("clear")).toHaveLength(0);
  });

  it("runs tool calls and asks the model to continue", async () => {
    const { bridge, openai, tools } = setup();
    await bridge.handleRealtimeEvent({
      type: "response.function_call_arguments.done",
      name: "check_availability",
      arguments: '{"service":"Haircut","date":"2026-11-10"}',
      call_id: "fc_1",
    });
    expect(tools).toHaveBeenCalledWith("check_availability", '{"service":"Haircut","date":"2026-11-10"}');
    expect(openai.ofType("conversation.item.create")[0]).toMatchObject({
      item: { type: "function_call_output", call_id: "fc_1", output: '{"ok":true}' },
    });
    expect(openai.ofType("response.create")).toHaveLength(2);
  });

  it("collects the transcript and ends once", async () => {
    const { bridge, openai, getTranscript } = setup();
    await bridge.handleRealtimeEvent({ type: "response.output_audio_transcript.done", transcript: "Hi, how can I help?" });
    await bridge.handleRealtimeEvent({ type: "conversation.item.input_audio_transcription.completed", transcript: " I need a haircut " });
    bridge.handleTwilioMessage({ event: "stop" });
    bridge.end();

    expect(openai.closed).toBe(true);
    expect(getTranscript()).toEqual([
      { role: "agent", text: "Hi, how can I help?", at: "2026-11-09T15:00:00.000Z" },
      { role: "caller", text: "I need a haircut", at: "2026-11-09T15:00:00.000Z" },
    ]);
  });
});
