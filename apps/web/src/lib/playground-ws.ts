import type {
  PlaygroundWSClientEvent,
  PlaygroundWSServerEvent,
} from "@arinova/shared/types";
import { WS_URL } from "./config";

type PlaygroundWSHandler = (event: PlaygroundWSServerEvent) => void;

class PlaygroundWebSocket {
  private ws: WebSocket | null = null;
  private handlers = new Set<PlaygroundWSHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private sessionId: string | null = null;

  connect(sessionId: string) {
    this.sessionId = sessionId;

    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    )
      return;

    this.cleanupSocket();

    try {
      const url = WS_URL.replace(/\/ws$/, "/ws/playground");
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.connected = true;
        this.reconnectDelay = 1000;
        this.startPing();

        // Authenticate with the session
        if (this.sessionId) {
          this.send({ type: "pg_auth", sessionId: this.sessionId });
        }
      };

      ws.onmessage = (event) => {
        if (this.ws !== ws) return;
        try {
          const data = JSON.parse(event.data) as PlaygroundWSServerEvent;
          for (const handler of this.handlers) {
            handler(data);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.connected = false;
        this.scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  disconnect() {
    this.sessionId = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupSocket();
    this.connected = false;
  }

  send(event: PlaygroundWSClientEvent) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  subscribe(handler: PlaygroundWSHandler) {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  isConnected() {
    return this.connected;
  }

  private cleanupSocket() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        this.maxReconnectDelay,
      );
      if (this.sessionId) {
        this.connect(this.sessionId);
      }
    }, this.reconnectDelay);
  }

  private startPing() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      this.send({ type: "ping" });
    }, 30000);
  }
}

export const playgroundWs = new PlaygroundWebSocket();
