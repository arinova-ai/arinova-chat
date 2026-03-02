"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Maximize2, Minimize2 } from "lucide-react";
import { useSpacesStore } from "@/store/spaces-store";
import type { PipMode } from "@/store/spaces-store";

function GameFAB({
  mode,
  onToggleMode,
  onClose,
}: {
  mode: PipMode;
  onToggleMode: () => void;
  onClose: () => void;
}) {
  const fabRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    dragging: boolean;
  }>({ startX: 0, startY: 0, origX: 0, origY: 0, dragging: false });
  const [pos, setPos] = useState({ x: -1, y: -1 });
  const didDrag = useRef(false);

  useEffect(() => {
    setPos({ x: window.innerWidth - 72, y: window.innerHeight - 140 });
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const el = fabRef.current;
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

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.dragging) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
    const newX = Math.max(
      0,
      Math.min(window.innerWidth - 56, dragState.current.origX + dx),
    );
    const newY = Math.max(
      0,
      Math.min(window.innerHeight - 56, dragState.current.origY + dy),
    );
    setPos({ x: newX, y: newY });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const el = fabRef.current;
    if (el) el.releasePointerCapture(e.pointerId);
    dragState.current.dragging = false;
  }, []);

  if (pos.x < 0) return null;

  return (
    <div
      ref={fabRef}
      className="fixed z-[60] flex flex-col gap-1.5 select-none touch-none"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <button
        onClick={() => {
          if (!didDrag.current) onToggleMode();
        }}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/90"
        title={mode === "fullscreen" ? "Picture-in-Picture" : "Fullscreen"}
      >
        {mode === "fullscreen" ? (
          <Minimize2 className="h-5 w-5" />
        ) : (
          <Maximize2 className="h-5 w-5" />
        )}
      </button>
      <button
        onClick={() => {
          if (!didDrag.current) onClose();
        }}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white shadow-lg backdrop-blur-sm transition hover:bg-red-600/90"
        title="Close"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

export function PipOverlay() {
  const pipMode = useSpacesStore((s) => s.pipMode);
  const iframeUrl = useSpacesStore((s) => s.pipIframeUrl);
  const togglePipMode = useSpacesStore((s) => s.togglePipMode);
  const closePip = useSpacesStore((s) => s.closePip);

  if (!pipMode || !iframeUrl) return null;

  return (
    <>
      <div
        className={
          pipMode === "fullscreen"
            ? "fixed inset-0 z-50 bg-background"
            : "fixed bottom-20 right-4 z-50 h-[240px] w-[360px] overflow-hidden rounded-2xl border border-border shadow-2xl md:bottom-6 md:right-6 md:h-[280px] md:w-[420px]"
        }
      >
        <iframe
          src={iframeUrl}
          className="h-full w-full border-none"
          allow="microphone; camera"
        />
      </div>
      <GameFAB
        mode={pipMode}
        onToggleMode={togglePipMode}
        onClose={closePip}
      />
    </>
  );
}
