import WebSocket from "ws";
import type { JsonSocket } from "./bridge.js";

export interface RealtimeConnection extends JsonSocket {
  onEvent(handler: (event: { type: string; [key: string]: unknown }) => void): void;
  onClose(handler: () => void): void;
}

export type ConnectRealtime = () => RealtimeConnection;

/**
 * Opens a WebSocket to the OpenAI Realtime API. Messages sent before the socket is open are
 * queued, so the caller doesn't have to wait for the handshake before forwarding audio.
 */
export function createRealtimeConnector(apiKey: string, model: string): ConnectRealtime {
  return () => {
    const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const queue: string[] = [];

    ws.on("open", () => {
      for (const msg of queue.splice(0)) ws.send(msg);
    });

    return {
      send(message) {
        const data = JSON.stringify(message);
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
        else if (ws.readyState === WebSocket.CONNECTING) queue.push(data);
      },
      close() {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
      },
      onEvent(handler) {
        ws.on("message", (raw) => handler(JSON.parse(raw.toString())));
      },
      onClose(handler) {
        ws.on("close", handler);
        ws.on("error", handler);
      },
    };
  };
}
