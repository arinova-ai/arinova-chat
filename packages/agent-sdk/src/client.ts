import type {
  ArinovaAgentOptions,
  AgentSkill,
  TaskContext,
  TaskHandler,
  AgentEvent,
  AgentEventListener,
} from "./types.js";

const DEFAULT_RECONNECT_INTERVAL = 5_000;
const DEFAULT_PING_INTERVAL = 30_000;

export class ArinovaAgent {
  private readonly serverUrl: string;
  private readonly botToken: string;
  private readonly skills: AgentSkill[];
  private readonly reconnectInterval: number;
  private readonly pingInterval: number;

  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private taskHandler: TaskHandler | null = null;
  private taskAbortControllers: Map<string, AbortController> = new Map();

  private listeners: Record<string, Array<(...args: unknown[]) => void>> = {
    connected: [],
    disconnected: [],
    error: [],
  };

  // Used to resolve/reject the connect() promise on first auth
  private connectResolve: (() => void) | null = null;
  private connectReject: ((err: Error) => void) | null = null;

  constructor(options: ArinovaAgentOptions) {
    this.serverUrl = options.serverUrl.replace(/\/$/, "");
    this.botToken = options.botToken;
    this.skills = options.skills ?? [];
    this.reconnectInterval = options.reconnectInterval ?? DEFAULT_RECONNECT_INTERVAL;
    this.pingInterval = options.pingInterval ?? DEFAULT_PING_INTERVAL;
  }

  /** Register a task handler. Called when the server sends a task. */
  onTask(handler: TaskHandler): this {
    this.taskHandler = handler;
    return this;
  }

  /** Register an event listener. */
  on<T extends AgentEvent>(event: T, listener: AgentEventListener<T>): this {
    this.listeners[event]?.push(listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Connect to the Arinova server.
   * Returns a promise that resolves on successful auth, or rejects on auth failure.
   */
  connect(): Promise<void> {
    this.stopped = false;
    return new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
      this.doConnect();
    });
  }

  /** Disconnect and stop reconnecting. */
  disconnect(): void {
    this.stopped = true;
    this.cleanup();
  }

  private emit(event: "connected" | "disconnected"): void;
  private emit(event: "error", error: Error): void;
  private emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners[event] ?? []) {
      listener(...args);
    }
  }

  private send(event: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  private cleanup(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.reconnectTimer = setTimeout(() => {
      if (!this.stopped) this.doConnect();
    }, this.reconnectInterval);
  }

  private doConnect(): void {
    if (this.stopped) return;
    this.cleanup();

    const wsUrl = `${this.serverUrl}/ws/agent`;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit("error", error);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      const authMsg: Record<string, unknown> = { type: "agent_auth", botToken: this.botToken };
      if (this.skills.length > 0) {
        authMsg.skills = this.skills;
      }
      this.send(authMsg);

      this.pingTimer = setInterval(() => {
        this.send({ type: "ping" });
      }, this.pingInterval);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data));

        if (data.type === "auth_ok") {
          this.emit("connected");
          // Resolve the connect() promise on first successful auth
          if (this.connectResolve) {
            this.connectResolve();
            this.connectResolve = null;
            this.connectReject = null;
          }
          return;
        }

        if (data.type === "auth_error") {
          const error = new Error(`Agent auth failed: ${data.error}`);
          this.emit("error", error);
          // Don't reconnect on auth error
          this.stopped = true;
          this.cleanup();
          // Reject the connect() promise
          if (this.connectReject) {
            this.connectReject(error);
            this.connectResolve = null;
            this.connectReject = null;
          }
          return;
        }

        if (data.type === "pong") {
          return;
        }

        if (data.type === "task") {
          this.handleTask(data);
          return;
        }

        if (data.type === "cancel_task") {
          const taskId = data.taskId as string;
          const controller = this.taskAbortControllers.get(taskId);
          if (controller) {
            controller.abort();
            this.taskAbortControllers.delete(taskId);
          }
          return;
        }
      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    };

    this.ws.onerror = () => {
      // WebSocket errors are followed by close events
    };

    this.ws.onclose = () => {
      this.cleanup();
      this.emit("disconnected");
      this.scheduleReconnect();
    };
  }

  private handleTask(data: Record<string, unknown>): void {
    if (!this.taskHandler) return;

    const taskId = data.taskId as string;
    const abortController = new AbortController();
    this.taskAbortControllers.set(taskId, abortController);

    const ctx: TaskContext = {
      taskId,
      conversationId: data.conversationId as string,
      content: data.content as string,
      conversationType: data.conversationType as string | undefined,
      members: data.members as { agentId: string; agentName: string }[] | undefined,
      replyTo: data.replyTo as { role: string; content: string; senderAgentName?: string } | undefined,
      sendChunk: (delta: string) => this.send({ type: "agent_chunk", taskId, chunk: delta }),
      sendComplete: (fullContent: string) => {
        this.taskAbortControllers.delete(taskId);
        this.send({ type: "agent_complete", taskId, content: fullContent });
      },
      sendError: (error: string) => {
        this.taskAbortControllers.delete(taskId);
        this.send({ type: "agent_error", taskId, error });
      },
      signal: abortController.signal,
    };

    Promise.resolve(this.taskHandler(ctx)).catch((err) => {
      const errorMsg = err instanceof Error ? err.message : String(err);
      ctx.sendError(errorMsg);
    });
  }
}
