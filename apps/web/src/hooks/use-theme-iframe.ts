"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent } from "@/components/office/types";

/** Messages sent from host to iframe */
type HostMessage =
  | { type: "init"; user: { id: string; name: string; username: string }; themeId: string; themeVersion: string; isMobile: boolean; pixelRatio: number; width: number; height: number; agents: Agent[] }
  | { type: "agents:update"; agents: Agent[] }
  | { type: "resize"; width: number; height: number };

/** Messages received from iframe */
interface IframeMessage {
  type: string;
  agentId?: string;
  path?: string;
  event?: string;
  data?: unknown;
}

export interface UseThemeIframeOptions {
  themeId: string;
  themeVersion?: string;
  agents: Agent[];
  user: { id: string; name: string; username: string };
  /** Called when theme selects an agent */
  onSelectAgent?: (agentId: string) => void;
  /** Called when theme wants to open chat */
  onOpenChat?: (agentId: string) => void;
  /** Called when theme wants to navigate */
  onNavigate?: (path: string) => void;
  /** Called on custom theme events */
  onThemeEvent?: (event: string, data?: unknown) => void;
  /** Runtime base URL (defaults to same origin for dev, themes.arinova.ai in prod) */
  runtimeOrigin?: string;
}

export function useThemeIframe(options: UseThemeIframeOptions) {
  const {
    themeId,
    themeVersion = "1.0.0",
    agents,
    user,
    onSelectAgent,
    onOpenChat,
    onNavigate,
    onThemeEvent,
    runtimeOrigin,
  } = options;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [iframeSrc, setIframeSrc] = useState("");

  // Stable refs for callbacks to avoid stale closures
  const callbacksRef = useRef({ onSelectAgent, onOpenChat, onNavigate, onThemeEvent });
  callbacksRef.current = { onSelectAgent, onOpenChat, onNavigate, onThemeEvent };

  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  // Compute iframe src
  useEffect(() => {
    const base = runtimeOrigin || window.location.origin;
    setIframeSrc(`${base}/runtime/${themeId}`);
  }, [themeId, runtimeOrigin]);

  // Determine target origin for postMessage
  const targetOrigin = runtimeOrigin || "*";

  // Send message to iframe
  const postToIframe = useCallback(
    (msg: HostMessage) => {
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(msg, targetOrigin);
      }
    },
    [targetOrigin],
  );

  // Listen for messages from iframe
  useEffect(() => {
    const handler = (e: MessageEvent<IframeMessage>) => {
      // If runtimeOrigin is set, validate origin
      if (runtimeOrigin && e.origin !== runtimeOrigin) return;

      const data = e.data;
      if (!data || typeof data.type !== "string") return;

      switch (data.type) {
        case "bridge:loaded":
          // Bridge loaded, send init
          postToIframe({
            type: "init",
            user,
            themeId,
            themeVersion,
            isMobile: /Mobi|Android/i.test(navigator.userAgent),
            pixelRatio: window.devicePixelRatio || 1,
            width: iframeRef.current?.clientWidth ?? window.innerWidth,
            height: iframeRef.current?.clientHeight ?? window.innerHeight,
            agents: agentsRef.current,
          });
          break;

        case "bridge:ready":
          setReady(true);
          break;

        case "agent:select":
          if (data.agentId) callbacksRef.current.onSelectAgent?.(data.agentId);
          break;

        case "agent:openChat":
          if (data.agentId) callbacksRef.current.onOpenChat?.(data.agentId);
          break;

        case "navigate":
          if (data.path) callbacksRef.current.onNavigate?.(data.path);
          break;

        case "theme:event":
          if (data.event) callbacksRef.current.onThemeEvent?.(data.event, data.data);
          break;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [postToIframe, user, themeId, themeVersion, runtimeOrigin]);

  // Push agents:update when agents change
  useEffect(() => {
    if (ready) {
      postToIframe({ type: "agents:update", agents });
    }
  }, [agents, ready, postToIframe]);

  // Push resize when window resizes
  useEffect(() => {
    if (!ready) return;

    const onResize = () => {
      const iframe = iframeRef.current;
      if (iframe) {
        postToIframe({
          type: "resize",
          width: iframe.clientWidth,
          height: iframe.clientHeight,
        });
      }
    };

    const observer = new ResizeObserver(onResize);
    const iframe = iframeRef.current;
    if (iframe) observer.observe(iframe);

    return () => observer.disconnect();
  }, [ready, postToIframe]);

  return {
    iframeRef,
    iframeSrc,
    ready,
  };
}
