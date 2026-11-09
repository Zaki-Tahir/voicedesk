import type OpenAI from "openai";
import type { TranscriptEntry } from "../realtime/bridge.js";

const PROMPT = `Summarize this phone call to a small business for the owner's call log.
Write 1-3 short sentences: who called, what they wanted, and the outcome (booked, question answered,
needs a callback). Mention names, services and times if they came up. Plain text, no preamble.`;

export function formatTranscript(transcript: TranscriptEntry[]): string {
  return transcript.map((t) => `${t.role === "agent" ? "Receptionist" : "Caller"}: ${t.text}`).join("\n");
}

export async function summarizeCall(openai: OpenAI, model: string, transcript: TranscriptEntry[]): Promise<string> {
  if (transcript.length === 0) return "Caller hung up before saying anything.";
  const res = await openai.responses.create({
    model,
    instructions: PROMPT,
    input: formatTranscript(transcript),
    max_output_tokens: 200,
  });
  return res.output_text.trim();
}
