"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Minimize2, Gamepad2 } from "lucide-react";
import { useSpacesStore } from "@/store/spaces-store";

// ---------------------------------------------------------------------------
// Shared draggable hook
// ---------------------------------------------------------------------------

function useDraggable(
  size: number,
  initialPos?: { x: number; y: number } | null,
  onPosChange?: (pos: { x: number; y: number }) => void,
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
    }
  }, []);

  return { ref, pos, didDrag, onPointerDown, onPointerMove, onPointerUp };
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
  const { ref, pos, didDrag, onPointerDown, onPointerMove, onPointerUp } =
    useDraggable(56, pipBtnPos, setPipBtnPos);

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
      <button
        onClick={() => {
          if (!didDrag.current) onExpand();
        }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg transition active:scale-95"
        title={gameName ?? "Game"}
      >
        <Gamepad2 className="h-6 w-6" />
      </button>

      {/* Small X badge — top-right corner */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white shadow-md"
        title="Close"
      >
        <X className="h-3 w-3" />
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
  const { ref, pos, didDrag, onPointerDown, onPointerMove, onPointerUp } =
    useDraggable(48, pipBtnPos, setPipBtnPos);

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
      <button
        onClick={() => {
          if (!didDrag.current) onMinimize();
        }}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-black/70 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/90 active:scale-95"
        title="Minimize"
      >
        <Minimize2 className="h-5 w-5" />
      </button>
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
  const togglePipMode = useSpacesStore((s) => s.togglePipMode);
  const closePip = useSpacesStore((s) => s.closePip);

  if (!pipMode || !iframeUrl) return null;

  if (pipMode === "fullscreen") {
    return (
      <>
        <div className="fixed inset-0 z-50 bg-background">
          <iframe
            src={iframeUrl}
            className="h-full w-full border-none"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
        <FullscreenMinimizeButton onMinimize={togglePipMode} />
      </>
    );
  }

  // PIP mode — collapsed circular bubble
  return (
    <PipBubble
      gameName={gameName}
      onExpand={togglePipMode}
      onClose={closePip}
    />
  );
}
