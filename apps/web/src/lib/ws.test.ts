import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to test WebSocketManager class. Since wsManager is a singleton exported,
// we'll test by importing fresh each time.

// Mock document.visibilityState for the ws module
Object.defineProperty(document, "visibilityState", {
  value: "visible",
  writable: true,
});

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  sent: string[] = [];

  constructor(public url: string) {
    // Auto-open after a tick
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event("open"));
    }, 0);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}

vi.mock("./config", () => ({
  WS_URL: "ws://localhost:21001/ws",
}));

describe("WebSocketManager", () => {
  let originalWS: typeof globalThis.WebSocket;

  beforeEach(() => {
    originalWS = globalThis.WebSocket;
    // @ts-expect-error - MockWebSocket is simplified
    globalThis.WebSocket = MockWebSocket;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.WebSocket = originalWS;
    vi.useRealTimers();
    vi.resetModules();
  });

  it("connects and transitions to syncing status", async () => {
    const { wsManager } = await import("./ws");
    wsManager.connect();
    await vi.advanceTimersByTimeAsync(10);
    // After WS opens, status goes to "syncing" (waits for sync_response to become "connected")
    expect(wsManager.status).toBe("syncing");
    wsManager.disconnect();
  });

  it("sends JSON through WebSocket", async () => {
    const { wsManager } = await import("./ws");
    wsManager.connect();
    await vi.advanceTimersByTimeAsync(10);
    // send should not throw
    wsManager.send({ type: "ping" } as never);
    wsManager.disconnect();
  });

  it("subscribes and unsubscribes handlers", async () => {
    const { wsManager } = await import("./ws");
    const handler = vi.fn();
    const unsub = wsManager.subscribe(handler);
    expect(typeof unsub).toBe("function");
    unsub();
    wsManager.disconnect();
  });

  it("disconnect clears connection state", async () => {
    const { wsManager } = await import("./ws");
    wsManager.connect();
    await vi.advanceTimersByTimeAsync(10);
    wsManager.disconnect();
    expect(wsManager.isConnected()).toBe(false);
    expect(wsManager.status).toBe("disconnected");
  });
});
