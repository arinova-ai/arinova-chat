"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Minimize2, Gamepad2 } from "lucide-react";
import { useSpacesStore } from "@/store/spaces-store";
import { useChatStore } from "@/store/chat-store";
import { authClient } from "@/lib/auth-client";
import { BACKEND_URL } from "@/lib/config";

// ---------------------------------------------------------------------------
// Shared draggable hook
// ---------------------------------------------------------------------------

function useDraggable(
  size: number,
  initialPos?: { x: number; y: number } | null,
  onPosChange?: (pos: { x: number; y: number }) => void,
  onTap?: () => void,
) {
  const ref = useRef<HTMLDivElement>(null);
  const dragState = useRef({
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    dragging: false,
  });
  const [pos, setPos] = useState({ x: -1, y: -1 });
  const didDrag = useRef(false);
  const onPosChangeRef = useRef(onPosChange);
  onPosChangeRef.current = onPosChange;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  useEffect(() => {
    setPos(
      initialPos ?? {
        x: window.innerWidth - size - 20,
        y: window.innerHeight - size - 100,
      },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const el = ref.current;
      if (!el) return;
      el.setPointerCapture(e.pointerId);
      didDrag.current = false;
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: pos.x,
        origY: pos.y,
        dragging: true,
      };
    },
    [pos],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState.current.dragging) return;
      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
      const newX = Math.max(
        0,
        Math.min(window.innerWidth - size, dragState.current.origX + dx),
      );
      const newY = Math.max(
        0,
        Math.min(window.innerHeight - size, dragState.current.origY + dy),
      );
      setPos({ x: newX, y: newY });
    },
    [size],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const el = ref.current;
    if (el) el.releasePointerCapture(e.pointerId);
    dragState.current.dragging = false;
    if (didDrag.current) {
      onPosChangeRef.current?.({ x: dragState.current.origX + (e.clientX - dragState.current.startX), y: dragState.current.origY + (e.clientY - dragState.current.startY) });
    } else {
      onTapRef.current?.();
    }
  }, []);

  return { ref, pos, onPointerDown, onPointerMove, onPointerUp };
}

// ---------------------------------------------------------------------------
// Draggable PIP bubble — collapsed circular button
// ---------------------------------------------------------------------------

function PipBubble({
  gameName,
  onExpand,
  onClose,
}: {
  gameName: string | null;
  onExpand: () => void;
  onClose: () => void;
}) {
  const pipBtnPos = useSpacesStore((s) => s.pipBtnPos);
  const setPipBtnPos = useSpacesStore((s) => s.setPipBtnPos);
  const { ref, pos, onPointerDown, onPointerMove, onPointerUp } =
    useDraggable(56, pipBtnPos, setPipBtnPos, onExpand);

  if (pos.x < 0) return null;

  return (
    <div
      ref={ref}
      className="fixed z-[60] select-none touch-none"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Main circle — tap to expand */}
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg transition active:scale-95 cursor-pointer"
        title={gameName ?? "Game"}
      >
        <Gamepad2 className="h-6 w-6" />
      </div>

      {/* Close badge — enlarged hit area around small visible circle */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={onClose}
        className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center"
        title="Close"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white shadow-md">
          <X className="h-3 w-3" />
        </span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draggable fullscreen minimize button
// ---------------------------------------------------------------------------

function FullscreenMinimizeButton({ onMinimize }: { onMinimize: () => void }) {
  const pipBtnPos = useSpacesStore((s) => s.pipBtnPos);
  const setPipBtnPos = useSpacesStore((s) => s.setPipBtnPos);
  const { ref, pos, onPointerDown, onPointerMove, onPointerUp } =
    useDraggable(48, pipBtnPos, setPipBtnPos, onMinimize);

  if (pos.x < 0) return null;

  return (
    <div
      ref={ref}
      className="fixed z-[60] select-none touch-none"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full bg-black/70 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/90 active:scale-95 cursor-pointer"
        title="Minimize"
      >
        <Minimize2 className="h-5 w-5" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PipOverlay — rendered in root layout (providers.tsx)
// ---------------------------------------------------------------------------

export function PipOverlay() {
  const pipMode = useSpacesStore((s) => s.pipMode);
  const iframeUrl = useSpacesStore((s) => s.pipIframeUrl);
  const gameName = useSpacesStore((s) => s.pipGameName);
  const pipAppId = useSpacesStore((s) => s.pipAppId);
  const togglePipMode = useSpacesStore((s) => s.togglePipMode);
  const closePip = useSpacesStore((s) => s.closePip);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { data: session } = authClient.useSession();
  const agents = useChatStore((s) => s.agents);
  const loadAgents = useChatStore((s) => s.loadAgents);

  const authSentRef = useRef(false);
  const oauthTokenRef = useRef<string | null>(null);
  const fetchingTokenRef = useRef(false);

  // Fetch OAuth token via internal-token endpoint (works with or without appId)
  const fetchOAuthToken = useCallback(async () => {
    if (fetchingTokenRef.current) return null;
    if (oauthTokenRef.current) return oauthTokenRef.current;

    fetchingTokenRef.current = true;
    try {
      const body: Record<string, string> = {};
      if (pipAppId) body.appId = pipAppId;
      const res = await fetch(`${BACKEND_URL}/api/oauth/internal-token`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const data = await res.json();
      oauthTokenRef.current = data.accessToken;
      return data.accessToken as string;
    } catch {
      return null;
    } finally {
      fetchingTokenRef.current = false;
    }
  }, [pipAppId]);

  // Reset token when app changes
  useEffect(() => {
    oauthTokenRef.current = null;
  }, [pipAppId]);

  const sendAuthToIframe = useCallback(async () => {
    if (!iframeRef.current?.contentWindow || !session?.user) return false;

    const accessToken = (await fetchOAuthToken()) ?? "";

    iframeRef.current.contentWindow.postMessage(
      {
        type: "arinova:auth",
        payload: {
          user: {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            image: session.user.image ?? null,
          },
          accessToken,
          agents: agents.map((a) => ({ id: a.id, name: a.name, description: a.description, avatarUrl: a.avatarUrl })),
        },
      },
      "*",
    );
    return true;
  }, [session, agents, fetchOAuthToken]);

  // Keep sending auth every 500ms for 30s — iframe JS may not be ready on first sends
  useEffect(() => {
    if (!pipMode || !iframeUrl) {
      authSentRef.current = false;
      return;
    }

    const interval = setInterval(() => {
      sendAuthToIframe();
    }, 500);

    // Stop retrying after 30s
    const timeout = setTimeout(() => clearInterval(interval), 30000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [pipMode, iframeUrl, sendAuthToIframe]);

  // Load agents if not yet loaded, then re-send auth with agents
  useEffect(() => {
    if (!pipMode || !iframeUrl) return;
    if (agents.length === 0) {
      loadAgents();
      return;
    }
    if (authSentRef.current) sendAuthToIframe();
  }, [agents, pipMode, iframeUrl, sendAuthToIframe, loadAgents]);

  if (!pipMode || !iframeUrl) return null;

  return (
    <>
      {/* Always keep iframe mounted to preserve game state across PIP toggle */}
      <div
        className={`fixed inset-0 z-50 bg-background ${pipMode === "fullscreen" ? "" : "pointer-events-none invisible"}`}
      >
        <iframe
          ref={iframeRef}
          src={iframeUrl}
          className="h-full w-full border-none"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={sendAuthToIframe}
        />
      </div>

      {pipMode === "fullscreen" ? (
        <FullscreenMinimizeButton onMinimize={togglePipMode} />
      ) : (
        <PipBubble
          gameName={gameName}
          onExpand={togglePipMode}
          onClose={closePip}
        />
      )}
    </>
  );
}
