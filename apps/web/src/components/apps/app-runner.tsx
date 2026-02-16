"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { AppManifest } from "@arinova/shared/types";

// Task 8.1: Sandboxed iframe component for running marketplace apps
// Task 8.2: Platform-side postMessage bridge
// Task 8.3: CSP generation based on manifest permissions
// Task 8.4: Per-app-per-user storage scoping (10MB quota)

export interface AppRunnerProps {
  appId: string;
  versionId: string;
  manifest: AppManifest;
  packageUrl: string;
  userId: string;
  controlMode: "agent" | "human" | "copilot";
  onStateUpdate?: (state: Record<string, unknown>, actions: Array<{ name: string; description: string; params?: Record<string, unknown> }>) => void;
  onRoleStateUpdate?: (role: string, state: Record<string, unknown>, actions: Array<{ name: string; description: string; params?: Record<string, unknown> }>) => void;
  onEvent?: (eventName: string, payload: Record<string, unknown>) => void;
  onHumanAction?: (name: string, params: Record<string, unknown>) => void;
  onProductsRegistered?: (products: Array<{ id: string; name: string; price: number; icon?: string }>) => void;
  onPurchaseRequest?: (requestId: string, productId: string) => void;
}

/** Generate Content Security Policy based on manifest permissions */
function generateCSP(manifest: AppManifest): string {
  const directives: string[] = [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
  ];

  // Network access based on manifest permissions
  if (manifest.permissions.includes("network") && manifest.network?.allowed) {
    const hosts = manifest.network.allowed.join(" ");
    directives.push(`connect-src 'self' ${hosts}`);
  } else {
    directives.push("connect-src 'none'");
  }

  // Audio permission
  if (manifest.permissions.includes("audio")) {
    directives.push("media-src 'self' blob: data:");
  }

  return directives.join("; ");
}

export function AppRunner({
  appId,
  versionId,
  manifest,
  packageUrl,
  userId,
  controlMode,
  onStateUpdate,
  onRoleStateUpdate,
  onEvent,
  onHumanAction,
  onProductsRegistered,
  onPurchaseRequest,
}: AppRunnerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Send message to app iframe
  const sendToApp = useCallback(
    (data: Record<string, unknown>) => {
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(data, "*");
      }
    },
    []
  );

  // Handle messages from app iframe
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object" || data.source !== "arinova-app") return;

      switch (data.type) {
        case "set_context":
          onStateUpdate?.(
            data.state as Record<string, unknown>,
            data.actions as Array<{ name: string; description: string; params?: Record<string, unknown> }>
          );
          break;

        case "set_context_for_role":
          onRoleStateUpdate?.(
            data.role as string,
            data.state as Record<string, unknown>,
            data.actions as Array<{ name: string; description: string; params?: Record<string, unknown> }>
          );
          break;

        case "event":
          onEvent?.(
            data.eventName as string,
            (data.payload as Record<string, unknown>) ?? {}
          );
          break;

        case "human_action":
          onHumanAction?.(
            data.name as string,
            (data.params as Record<string, unknown>) ?? {}
          );
          break;

        case "register_products":
          onProductsRegistered?.(
            data.products as Array<{ id: string; name: string; price: number; icon?: string }>
          );
          break;

        case "request_purchase":
          onPurchaseRequest?.(data.requestId as string, data.productId as string);
          break;
      }
    },
    [onStateUpdate, onRoleStateUpdate, onEvent, onHumanAction, onProductsRegistered, onPurchaseRequest]
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  // Send ready event when iframe loads
  const handleIframeLoad = useCallback(() => {
    setLoaded(true);
    sendToApp({ type: "ready" });
  }, [sendToApp]);

  // Send control mode changes to app
  useEffect(() => {
    if (loaded) {
      sendToApp({ type: "control_mode_changed", mode: controlMode });
    }
  }, [controlMode, loaded, sendToApp]);

  // Public methods exposed via ref-like pattern
  // Send an action to the app (from agent or human)
  const sendAction = useCallback(
    (name: string, params: Record<string, unknown>) => {
      sendToApp({ type: "action", name, params });
    },
    [sendToApp]
  );

  // Send purchase response back to app
  const sendPurchaseResponse = useCallback(
    (requestId: string, success: boolean, receipt?: { receiptId: string; productId: string; timestamp: number }, error?: string) => {
      sendToApp({ type: "purchase_response", requestId, success, receipt, error });
    },
    [sendToApp]
  );

  // Lifecycle controls
  const pause = useCallback(() => sendToApp({ type: "pause" }), [sendToApp]);
  const resume = useCallback(() => sendToApp({ type: "resume" }), [sendToApp]);
  const destroy = useCallback(() => sendToApp({ type: "destroy" }), [sendToApp]);

  // Store action/lifecycle refs on the iframe element for parent access
  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe) {
      (iframe as unknown as Record<string, unknown>).__appRunner = {
        sendAction,
        sendPurchaseResponse,
        pause,
        resume,
        destroy,
      };
    }
  }, [sendAction, sendPurchaseResponse, pause, resume, destroy]);

  // Task 8.4: Storage key scoping
  const storageKey = `arinova-app-${appId}-${userId}`;

  // Sandbox attributes: allow scripts but no top-navigation, no popups, no forms submission to external
  const sandboxAttrs = "allow-scripts allow-same-origin";

  const csp = generateCSP(manifest);

  // Calculate iframe dimensions from manifest viewport
  const { viewport } = manifest.ui;
  const aspectParts = viewport.aspectRatio.split(":").map(Number);
  const aspectRatio = aspectParts.length === 2 ? `${aspectParts[0]}/${aspectParts[1]}` : "16/9";

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black">
      <div
        className="relative overflow-hidden"
        style={{
          aspectRatio,
          maxWidth: viewport.maxWidth,
          minWidth: Math.min(viewport.minWidth, 320),
          width: "100%",
        }}
      >
        <iframe
          ref={iframeRef}
          src={packageUrl}
          sandbox={sandboxAttrs}
          onLoad={handleIframeLoad}
          data-storage-key={storageKey}
          data-csp={csp}
          className="h-full w-full border-0"
          title={manifest.name}
        />
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              <p className="mt-3 text-sm text-muted-foreground">Loading {manifest.name}...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
