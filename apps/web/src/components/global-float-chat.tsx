"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOfficePipStore } from "@/store/float-window-store";
import { ThemeIframe } from "@/components/office/theme-iframe";
import { X, Maximize2 } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";

const DEFAULT_WIDTH = 180;
const DEFAULT_HEIGHT = 120;
const MIN_WIDTH = 120;
const MIN_HEIGHT = 80;
const MAX_WIDTH = 480;
const MAX_HEIGHT = 360;
const EDGE_MARGIN = 12;

export function GlobalOfficePip() {
  const active = useOfficePipStore((s) => s.active);
  const themeId = useOfficePipStore((s) => s.themeId);
  const agents = useOfficePipStore((s) => s.agents);
  const user = useOfficePipStore((s) => s.user);
  const exit = useOfficePipStore((s) => s.exit);
  const router = useRouter();
  const pathname = usePathname();

  const justEnteredRef = useRef(false);
  useEffect(() => {
    if (active) justEnteredRef.current = true;
  }, [active]);

  // Auto-exit PiP when user navigates back to /office
  useEffect(() => {
    if (!active || !pathname?.startsWith("/office")) return;
    if (justEnteredRef.current) {
      justEnteredRef.current = false;
      return;
    }
    exit();
  }, [active, pathname, exit]);

  // Size state
  const [size, setSize] = useState({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });

  // Position state
  const [pos, setPos] = useState({
    x: typeof window !== "undefined" ? window.innerWidth - DEFAULT_WIDTH - EDGE_MARGIN : 0,
    y: typeof window !== "undefined" ? window.innerHeight - DEFAULT_HEIGHT - 100 : 0,
  });

  // Reset position + size when entering PiP
  useEffect(() => {
    if (active) {
      setSize({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });
      setPos({
        x: window.innerWidth - DEFAULT_WIDTH - EDGE_MARGIN,
        y: window.innerHeight - DEFAULT_HEIGHT - 100,
      });
    }
  }, [active]);

  // ── Drag (move) ──────────────────────────────────────────
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);

  const onDragMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const curSize = size;
    dragRef.current = { startX: e.clientX, startY: e.clientY, posX: pos.x, posY: pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - curSize.w, dragRef.current.posX + ev.clientX - dragRef.current.startX)),
        y: Math.max(0, Math.min(window.innerHeight - curSize.h, dragRef.current.posY + ev.clientY - dragRef.current.startY)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [pos, size]);

  const touchDragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);
  const onDragTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchDragRef.current = { startX: t.clientX, startY: t.clientY, posX: pos.x, posY: pos.y };
  }, [pos]);

  const onDragTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchDragRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    const curSize = size;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - curSize.w, touchDragRef.current.posX + t.clientX - touchDragRef.current.startX)),
      y: Math.max(0, Math.min(window.innerHeight - curSize.h, touchDragRef.current.posY + t.clientY - touchDragRef.current.startY)),
    });
  }, [size]);

  const onDragTouchEnd = useCallback(() => { touchDragRef.current = null; }, []);

  // ── Resize ───────────────────────────────────────────────
  const resizeRef = useRef<{ startX: number; startY: number; w: number; h: number } | null>(null);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, w: size.w, h: size.h };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dw = ev.clientX - resizeRef.current.startX;
      const dh = ev.clientY - resizeRef.current.startY;
      setSize({
        w: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeRef.current.w + dw)),
        h: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeRef.current.h + dh)),
      });
    };
    const onUp = () => {
      resizeRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [size]);

  const touchResizeRef = useRef<{ startX: number; startY: number; w: number; h: number } | null>(null);
  const onResizeTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    const t = e.touches[0];
    if (!t) return;
    touchResizeRef.current = { startX: t.clientX, startY: t.clientY, w: size.w, h: size.h };
  }, [size]);

  const onResizeTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchResizeRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dw = t.clientX - touchResizeRef.current.startX;
    const dh = t.clientY - touchResizeRef.current.startY;
    setSize({
      w: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, touchResizeRef.current.w + dw)),
      h: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, touchResizeRef.current.h + dh)),
    });
  }, []);

  const onResizeTouchEnd = useCallback(() => { touchResizeRef.current = null; }, []);

  const handleExpand = useCallback(() => {
    exit();
    router.push("/office");
  }, [exit, router]);

  if (!active || !themeId || !user) return null;

  return (
    <div
      className="fixed z-[9999] rounded-xl overflow-hidden shadow-2xl border border-border bg-black"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
    >
      {/* Drag handle overlay + controls (excludes bottom-right resize corner) */}
      <div
        className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing"
        onMouseDown={onDragMouseDown}
        onTouchStart={onDragTouchStart}
        onTouchMove={onDragTouchMove}
        onTouchEnd={onDragTouchEnd}
      >
        {/* Top-right controls */}
        <div className="absolute top-1 right-1 flex gap-1">
          <button
            type="button"
            className="h-6 w-6 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
            onClick={(e) => { e.stopPropagation(); handleExpand(); }}
          >
            <Maximize2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="h-6 w-6 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
            onClick={(e) => { e.stopPropagation(); exit(); }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Resize handle — bottom-right corner */}
      <div
        className="absolute bottom-0 right-0 z-20 h-4 w-4 cursor-nwse-resize"
        onMouseDown={onResizeMouseDown}
        onTouchStart={onResizeTouchStart}
        onTouchMove={onResizeTouchMove}
        onTouchEnd={onResizeTouchEnd}
      >
        {/* Visual triangle indicator */}
        <svg className="h-4 w-4 text-white/60" viewBox="0 0 16 16">
          <path d="M14 16L16 16L16 14Z" fill="currentColor" />
          <path d="M8 16L16 16L16 8Z" fill="currentColor" opacity="0.4" />
        </svg>
      </div>

      {/* Office ThemeIframe with full context */}
      <div className="h-full w-full pointer-events-none">
        <ThemeIframe
          themeId={themeId}
          agents={agents}
          user={user}
          width={size.w}
          height={size.h}
          isMobile
        />
      </div>
    </div>
  );
}
