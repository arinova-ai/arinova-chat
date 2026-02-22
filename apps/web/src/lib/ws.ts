import type { WSClientEvent, WSServerEvent } from "@arinova/shared/types";
import { WS_URL } from "./config";

export type ConnectionStatus = "connected" | "disconnected" | "syncing";

type WSEventHandler = (event: WSServerEvent) => void;
type StatusChangeHandler = (status: ConnectionStatus) => void;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private handlers = new Set<WSEventHandler>();
  private statusHandlers = new Set<StatusChangeHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private _status: ConnectionStatus = "disconnected";

  get status(): ConnectionStatus {
    return this._status;
  }

  private setStatus(newStatus: ConnectionStatus) {
    if (this._status === newStatus) return;
    this._status = newStatus;
    for (const handler of this.statusHandlers) {
      handler(newStatus);
    }
  }

  onStatusChange(handler: StatusChangeHandler) {
    this.statusHandlers.add(handler);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;

    // Close any lingering socket before creating a new one
    this.cleanupSocket();

    try {
      const ws = new WebSocket(WS_URL);
      this.ws = ws;

      ws.onopen = () => {
        if (this.ws !== ws) return; // stale reference guard
        this.setStatus("connected");
        this.reconnectDelay = 1000;
        this.startPing();
      };

      ws.onmessage = (event) => {
        if (this.ws !== ws) return; // stale reference guard
        try {
          const data = JSON.parse(event.data) as WSServerEvent;
          for (const handler of this.handlers) {
            handler(data);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (this.ws !== ws) return; // stale reference guard
        this.setStatus("disconnected");
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupSocket();
    this.setStatus("disconnected");
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

  send(event: WSClientEvent) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  subscribe(handler: WSEventHandler) {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  isConnected() {
    return this._status === "connected";
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        this.maxReconnectDelay
      );
      this.connect();
    }, this.reconnectDelay);
  }

  private pingInterval: ReturnType<typeof setInterval> | null = null;

  private startPing() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      this.send({ type: "ping" });
    }, 30000);
  }
}

export const wsManager = new WebSocketManager();
