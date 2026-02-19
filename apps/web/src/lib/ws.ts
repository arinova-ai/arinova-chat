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

  // Track last known seq per conversation for sync protocol
  private lastSeqs: Record<string, number> = {};

  get status(): ConnectionStatus {
    return this._status;
  }

  private setStatus(status: ConnectionStatus) {
    if (this._status === status) return;
    this._status = status;
    for (const handler of this.statusHandlers) {
      handler(status);
    }
  }

  connect() {
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    )
      return;

    this.cleanupSocket();

    try {
      const ws = new WebSocket(WS_URL);
      this.ws = ws;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.setStatus("syncing");
        this.reconnectDelay = 1000;
        this.startPing();
        // Send sync request with last known seqs
        this.sendSync();
      };

      ws.onmessage = (event) => {
        if (this.ws !== ws) return;
        try {
          const data = JSON.parse(event.data) as WSServerEvent;

          // Track seq from stream events
          if (
            data.type === "stream_start" ||
            data.type === "stream_chunk" ||
            data.type === "stream_end" ||
            data.type === "stream_error"
          ) {
            if (data.seq > 0) {
              this.updateLastSeq(data.conversationId, data.seq);
            }
          }

          // Update lastSeqs from sync_response
          if (data.type === "sync_response") {
            for (const conv of data.conversations) {
              this.updateLastSeq(conv.conversationId, conv.maxSeq);
            }
            for (const msg of data.missedMessages) {
              this.updateLastSeq(msg.conversationId, msg.seq);
            }
            this.setStatus("connected");
          }

          for (const handler of this.handlers) {
            handler(data);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (this.ws !== ws) return;
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
    this.removeVisibilityListeners();
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

  onStatusChange(handler: StatusChangeHandler) {
    this.statusHandlers.add(handler);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  isConnected() {
    return this._status === "connected";
  }

  /** Update tracked lastSeq for a conversation */
  updateLastSeq(conversationId: string, seq: number) {
    if (seq > (this.lastSeqs[conversationId] ?? 0)) {
      this.lastSeqs[conversationId] = seq;
    }
  }

  /** Send sync request with current conversation seq positions */
  private sendSync() {
    this.send({
      type: "sync",
      conversations: { ...this.lastSeqs },
    });
  }

  /** Force reconnect or re-sync if already connected */
  reconnect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Already connected, just re-sync
      this.setStatus("syncing");
      this.sendSync();
      return;
    }
    // Cancel any pending reconnect and connect immediately
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectDelay = 1000;
    this.connect();
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

  // --- Visibility and online event listeners ---

  private visibilityHandler: (() => void) | null = null;
  private onlineHandler: (() => void) | null = null;

  setupVisibilityListeners() {
    // Reconnect when tab becomes visible (mobile app switch)
    this.visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        this.reconnect();
      }
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);

    // Reconnect when network comes back online
    this.onlineHandler = () => {
      this.reconnect();
    };
    window.addEventListener("online", this.onlineHandler);
  }

  private removeVisibilityListeners() {
    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.onlineHandler) {
      window.removeEventListener("online", this.onlineHandler);
      this.onlineHandler = null;
    }
  }
}

export const wsManager = new WebSocketManager();
