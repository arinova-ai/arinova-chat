"use client";

import { useEffect, useRef } from "react";

type DiagPayload = Record<string, unknown> | undefined;

interface DiagEvent {
  ts: string;
  name: string;
  payload?: DiagPayload;
}

interface ChatDiagPublic {
  enabled: boolean;
  startedAt: string;
  counters: Record<string, number>;
  events: DiagEvent[];
  dump: () => {
    enabled: boolean;
    startedAt: string;
    counters: Record<string, number>;
    events: DiagEvent[];
  };
  clear: () => void;
}

declare global {
  interface Window {
    __arinovaChatDiag?: ChatDiagPublic;
  }
}

const STORAGE_KEY = "arinova_chat_diag";
const MAX_EVENTS = 400;

let initialized = false;

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(STORAGE_KEY) === "1") return true;
  } catch {
    // ignore
  }
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("chatdiag") === "1";
  } catch {
    return false;
  }
}

function ensure(): ChatDiagPublic | null {
  if (typeof window === "undefined") return null;
  const enabled = isEnabled();
  if (!window.__arinovaChatDiag) {
    window.__arinovaChatDiag = {
      enabled,
      startedAt: new Date().toISOString(),
      counters: {},
      events: [],
      dump() {
        return {
          enabled: this.enabled,
          startedAt: this.startedAt,
          counters: { ...this.counters },
          events: [...this.events],
        };
      },
      clear() {
        this.counters = {};
        this.events = [];
      },
    };
  } else {
    window.__arinovaChatDiag.enabled = enabled;
  }
  return window.__arinovaChatDiag;
}

function pushEvent(name: string, payload?: DiagPayload) {
  const diag = ensure();
  if (!diag || !diag.enabled) return;
  diag.events.push({ ts: new Date().toISOString(), name, payload });
  if (diag.events.length > MAX_EVENTS) {
    diag.events.splice(0, diag.events.length - MAX_EVENTS);
  }
}

export function diagCount(name: string, delta = 1, payload?: DiagPayload) {
  const diag = ensure();
  if (!diag || !diag.enabled) return;
  diag.counters[name] = (diag.counters[name] ?? 0) + delta;
  if (payload) pushEvent(name, payload);
}

export function diagEvent(name: string, payload?: DiagPayload) {
  pushEvent(name, payload);
}

export function initChatDiagnostics() {
  const diag = ensure();
  if (!diag || !diag.enabled || initialized) return;
  initialized = true;

  pushEvent("diag:init", { href: window.location.href });

  window.addEventListener("error", (e) => {
    const message = e.message || "";
    if (message.includes("Minified React error #185") || message.includes("Maximum update depth exceeded")) {
      pushEvent("react:error:185", {
        message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        stack: e.error instanceof Error ? e.error.stack : undefined,
      });
      // Keep one loud signal in console for quick capture from production users
      // eslint-disable-next-line no-console
      console.error("[chat-diag] React #185 captured. Run window.__arinovaChatDiag?.dump()");
    }
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    const asString =
      reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason ?? "");
    if (asString.includes("185") || asString.includes("Maximum update depth exceeded")) {
      pushEvent("react:rejection:185", {
        reason: asString,
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    }
  });
}

export function useRenderDiag(name: string, payload?: () => DiagPayload) {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  useEffect(() => {
    const count = renderCountRef.current;
    diagCount(`render:${name}`);
    if (count % 20 === 0) {
      diagEvent(`render-sample:${name}`, payload?.());
    }
  });
}

