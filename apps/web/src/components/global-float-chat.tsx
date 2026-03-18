"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOfficePipStore } from "@/store/float-window-store";
import { X, Maximize2 } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";

const PIP_WIDTH = 180;
const PIP_HEIGHT = 120;
const EDGE_MARGIN = 12;

export function GlobalOfficePip() {
  const active = useOfficePipStore((s) => s.active);
  const iframeSrc = useOfficePipStore((s) => s.iframeSrc);
  const exit = useOfficePipStore((s) => s.exit);
  const router = useRouter();
  const pathname = usePathname();

  // Auto-exit PiP when navigating back to /office
  useEffect(() => {
    if (active && pathname?.startsWith("/office")) {
      exit();
    }
  }, [active, pathname, exit]);

  // Drag state
  const [pos, setPos] = useState({
    x: typeof window !== "undefined" ? window.innerWidth - PIP_WIDTH - EDGE_MARGIN : 0,
    y: typeof window !== "undefined" ? window.innerHeight - PIP_HEIGHT - 100 : 0,
  });
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);

  // Reset position when entering PiP
  useEffect(() => {
    if (active) {
      setPos({
        x: window.innerWidth - PIP_WIDTH - EDGE_MARGIN,
        y: window.innerHeight - PIP_HEIGHT - 100,
      });
    }
  }, [active]);

  // Mouse drag
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, posX: pos.x, posY: pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - PIP_WIDTH, dragRef.current.posX + ev.clientX - dragRef.current.startX)),
        y: Math.max(0, Math.min(window.innerHeight - PIP_HEIGHT, dragRef.current.posY + ev.clientY - dragRef.current.startY)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [pos]);

  // Touch drag
  const touchRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchRef.current = { startX: t.clientX, startY: t.clientY, posX: pos.x, posY: pos.y };
  }, [pos]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - PIP_WIDTH, touchRef.current.posX + t.clientX - touchRef.current.startX)),
      y: Math.max(0, Math.min(window.innerHeight - PIP_HEIGHT, touchRef.current.posY + t.clientY - touchRef.current.startY)),
    });
  }, []);

  const onTouchEnd = useCallback(() => { touchRef.current = null; }, []);

  const handleExpand = useCallback(() => {
    exit();
    router.push("/office");
  }, [exit, router]);

  if (!active || !iframeSrc) return null;

  return (
    <div
      className="fixed z-[9999] rounded-xl overflow-hidden shadow-2xl border border-border bg-black"
      style={{ left: pos.x, top: pos.y, width: PIP_WIDTH, height: PIP_HEIGHT }}
    >
      {/* Drag handle overlay + controls */}
      <div
        className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
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

      {/* Office iframe */}
      <iframe
        src={iframeSrc}
        sandbox="allow-scripts allow-same-origin"
        title="Office PiP"
        className="h-full w-full border-0 pointer-events-none"
        style={{ display: "block" }}
      />
    </div>
  );
}
