// @arinova/app-sdk — Client SDK for Arinova Chat marketplace apps

export interface ActionDefinition {
  name: string;
  description: string;
  params?: Record<string, unknown>;
  humanOnly?: boolean;
  agentOnly?: boolean;
}

export interface AppContext {
  state: Record<string, unknown>;
  actions: ActionDefinition[];
  humanLabel?: string;
}

export interface RoleContext extends AppContext {
  prompt?: string;
}

export interface ProductDefinition {
  id: string;
  name: string;
  price: number;
  icon?: string;
}

export interface PurchaseReceipt {
  receiptId: string;
  productId: string;
  timestamp: number;
}

export type ControlMode = "agent" | "human" | "copilot";

// ===== Internal message protocol (app ↔ platform via postMessage) =====

interface PlatformMessage {
  type: string;
  [key: string]: unknown;
}

interface ActionMessage extends PlatformMessage {
  type: "action";
  name: string;
  params: Record<string, unknown>;
}

interface ControlModeMessage extends PlatformMessage {
  type: "control_mode_changed";
  mode: ControlMode;
}

interface PurchaseResponseMessage extends PlatformMessage {
  type: "purchase_response";
  requestId: string;
  success: boolean;
  receipt?: PurchaseReceipt;
  error?: string;
}

interface ReadyMessage extends PlatformMessage {
  type: "ready";
}

interface LifecycleMessage extends PlatformMessage {
  type: "pause" | "resume" | "destroy";
}

// ===== ArinovaApp =====

type ActionHandler = (params: Record<string, unknown>) => void;

export class ArinovaApp {
  private actionHandlers = new Map<string, ActionHandler>();
  private anyActionHandler: ActionHandler | null = null;
  private controlModeHandler: ((mode: ControlMode) => void) | null = null;
  private readyHandler: (() => void) | null = null;
  private pauseHandler: (() => void) | null = null;
  private resumeHandler: (() => void) | null = null;
  private destroyHandler: (() => void) | null = null;
  private pendingPurchases = new Map<string, {
    resolve: (receipt: PurchaseReceipt) => void;
    reject: (error: Error) => void;
  }>();
  private purchaseCounter = 0;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("message", this.handleMessage);
    }
  }

  // ===== State management =====

  /** Push current state and available actions to the platform (for single-role or dynamic mode) */
  setContext(ctx: AppContext): void {
    this.send({ type: "set_context", ...ctx });
  }

  /** Push state for a specific role (multi-role apps with partial observability) */
  setStateForRole(role: string, ctx: AppContext): void {
    this.send({ type: "set_context_for_role", role, ...ctx });
  }

  // ===== Action handling =====

  /** Register a handler for a specific action */
  onAction(name: string, handler: ActionHandler): void {
    this.actionHandlers.set(name, handler);
  }

  /** Register a catch-all handler for unhandled actions */
  onAnyAction(handler: ActionHandler): void {
    this.anyActionHandler = handler;
  }

  // ===== Events =====

  /** Emit an event to connected agents */
  emit(eventName: string, payload?: Record<string, unknown>): void {
    this.send({ type: "event", eventName, payload: payload ?? {} });
  }

  // ===== Control mode =====

  /** Listen for control mode changes (agent/human/copilot) */
  onControlModeChanged(handler: (mode: ControlMode) => void): void {
    this.controlModeHandler = handler;
  }

  /** Report a human action taken directly on the game UI */
  reportHumanAction(name: string, params?: Record<string, unknown>): void {
    this.send({ type: "human_action", name, params: params ?? {} });
  }

  // ===== Monetization =====

  /** Register purchasable products for this app session */
  registerProducts(products: ProductDefinition[]): void {
    this.send({ type: "register_products", products });
  }

  /** Request a purchase — shows confirmation dialog to user, returns receipt on success */
  requestPurchase(productId: string): Promise<PurchaseReceipt> {
    const requestId = `purchase_${++this.purchaseCounter}_${Date.now()}`;
    return new Promise((resolve, reject) => {
      this.pendingPurchases.set(requestId, { resolve, reject });
      this.send({ type: "request_purchase", requestId, productId });
    });
  }

  // ===== Lifecycle =====

  onReady(handler: () => void): void {
    this.readyHandler = handler;
  }

  onPause(handler: () => void): void {
    this.pauseHandler = handler;
  }

  onResume(handler: () => void): void {
    this.resumeHandler = handler;
  }

  onDestroy(handler: () => void): void {
    this.destroyHandler = handler;
  }

  /** Clean up event listeners */
  dispose(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("message", this.handleMessage);
    }
  }

  // ===== Internal =====

  private send(data: Record<string, unknown>): void {
    const target = typeof window !== "undefined" ? window.parent : null;
    if (target && target !== window) {
      target.postMessage({ source: "arinova-app", ...data }, "*");
    }
  }

  private handleMessage = (event: MessageEvent): void => {
    const data = event.data;
    if (!data || typeof data !== "object") return;

    switch (data.type) {
      case "action": {
        const msg = data as ActionMessage;
        const handler = this.actionHandlers.get(msg.name);
        if (handler) {
          handler(msg.params);
        } else if (this.anyActionHandler) {
          this.anyActionHandler(msg.params);
        }
        break;
      }
      case "control_mode_changed": {
        const msg = data as ControlModeMessage;
        this.controlModeHandler?.(msg.mode);
        break;
      }
      case "purchase_response": {
        const msg = data as PurchaseResponseMessage;
        const pending = this.pendingPurchases.get(msg.requestId);
        if (pending) {
          this.pendingPurchases.delete(msg.requestId);
          if (msg.success && msg.receipt) {
            pending.resolve(msg.receipt);
          } else {
            pending.reject(new Error(msg.error ?? "Purchase failed"));
          }
        }
        break;
      }
      case "ready":
        this.readyHandler?.();
        break;
      case "pause":
        this.pauseHandler?.();
        break;
      case "resume":
        this.resumeHandler?.();
        break;
      case "destroy":
        this.destroyHandler?.();
        break;
    }
  };
}
