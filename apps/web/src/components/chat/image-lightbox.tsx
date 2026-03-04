"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  className?: string;
  // Gallery mode
  images?: { src: string; alt?: string }[];
  initialIndex?: number;
}

export function ImageLightbox({ src, alt, className, images, initialIndex }: ImageLightboxProps) {
  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex ?? 0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const gallery = images && images.length > 1 ? images : null;
  const currentSrc = gallery ? gallery[currentIndex]?.src ?? src : src;
  const currentAlt = gallery ? gallery[currentIndex]?.alt ?? alt : alt;

  const canPrev = gallery ? currentIndex > 0 : false;
  const canNext = gallery ? currentIndex < gallery.length - 1 : false;

  const goToPrev = useCallback(() => {
    if (canPrev) setCurrentIndex((i) => i - 1);
  }, [canPrev]);

  const goToNext = useCallback(() => {
    if (canNext) setCurrentIndex((i) => i + 1);
  }, [canNext]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowLeft") goToPrev();
      if (e.key === "ArrowRight") goToNext();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, goToPrev, goToNext]);

  // Reset index when opening
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex ?? 0);
    }
  }, [open, initialIndex]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    // Only trigger swipe if horizontal movement is significant and greater than vertical
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) goToPrev();
      else goToNext();
    }
  }, [goToPrev, goToNext]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? ""}
        className={className ?? "max-w-full rounded-lg cursor-zoom-in"}
        onClick={() => setOpen(true)}
      />
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
            style={{
              paddingTop: "max(1rem, env(safe-area-inset-top, 1rem))",
              paddingBottom: "max(1rem, env(safe-area-inset-bottom, 1rem))",
              paddingLeft: "env(safe-area-inset-left, 0px)",
              paddingRight: "env(safe-area-inset-right, 0px)",
            }}
            onClick={() => setOpen(false)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Close button */}
            <button
              className="absolute right-4 rounded-full bg-card/80 p-3 text-white hover:bg-accent transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center z-10"
              style={{ top: "max(1rem, env(safe-area-inset-top, 1rem))" }}
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            >
              <X className="h-5 w-5" />
            </button>

            {/* Left arrow */}
            {gallery && canPrev && (
              <button
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-card/80 p-2 text-white hover:bg-accent transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center z-10"
                onClick={(e) => { e.stopPropagation(); goToPrev(); }}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            {/* Right arrow */}
            {gallery && canNext && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-card/80 p-2 text-white hover:bg-accent transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center z-10"
                onClick={(e) => { e.stopPropagation(); goToNext(); }}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}

            {/* Image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentSrc}
              alt={currentAlt ?? ""}
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            />

            {/* Page indicator */}
            {gallery && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-card/80 px-3 py-1 text-sm text-white z-10">
                {currentIndex + 1}/{gallery.length}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
