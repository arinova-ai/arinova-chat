"use client";

import { useCallback, useEffect, useRef } from "react";
import { BACKEND_URL } from "@/lib/config";
import type { Agent } from "./types";

export interface ThemeIframeProps {
  themeId: string;
  agents: Agent[];
  user: { id: string; name: string; username: string };
  width: number;
  height: number;
  isMobile?: boolean;
  onSelectAgent?: (agentId: string) => void;
  onOpenChat?: (agentId: string) => void;
  onNavigate?: (path: string) => void;
}

export function ThemeIframe({
  themeId,
  agents,
  user,
  width,
  height,
  isMobile = false,
  onSelectAgent,
  onOpenChat,
  onNavigate,
}: ThemeIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const pendingInitRef = useRef(false);

  const postToIframe = useCallback(
    (msg: Record<string, unknown>) => {
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(msg, "*");
      }
    },
    [],
  );

  const sendInit = useCallback(() => {
    readyRef.current = true;
    postToIframe({
      type: "init",
      user,
      themeId,
      themeVersion: "0.0.0",
      isMobile,
      pixelRatio: window.devicePixelRatio || 1,
      agents,
      width,
      height,
    });
  }, [postToIframe, user, themeId, isMobile, agents, width, height]);

  // Listen for messages from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const data = e.data;
      if (!data || typeof data.type !== "string") return;

      // Only accept messages from our iframe
      const iframe = iframeRef.current;
      if (!iframe || e.source !== iframe.contentWindow) return;

      switch (data.type) {
        case "ready":
          sendInit();
          break;
        case "agent:select":
          if (data.agentId) onSelectAgent?.(data.agentId);
          break;
        case "agent:openChat":
          if (data.agentId) onOpenChat?.(data.agentId);
          break;
        case "navigate":
          if (data.path) onNavigate?.(data.path);
          break;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [sendInit, onSelectAgent, onOpenChat, onNavigate]);

  // Send agents:update when agents change (after init)
  useEffect(() => {
    if (!readyRef.current) return;
    postToIframe({ type: "agents:update", agents });
  }, [agents, postToIframe]);

  // Send resize when dimensions change (after init)
  useEffect(() => {
    if (!readyRef.current) return;
    postToIframe({ type: "resize", width, height });
  }, [width, height, postToIframe]);

  // Reset ready state when themeId changes (new iframe will load)
  useEffect(() => {
    readyRef.current = false;
  }, [themeId]);

  const src = `${BACKEND_URL}/runtime/${encodeURIComponent(themeId)}`;

  return (
    <iframe
      ref={iframeRef}
      key={themeId}
      src={src}
      sandbox="allow-scripts"
      title={`Office theme: ${themeId}`}
      className="h-full w-full border-0"
      style={{ display: "block" }}
    />
  );
}
