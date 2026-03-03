"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function ImageLightbox({ src, alt, className }: { src: string; alt?: string; className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
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
          >
            <button
              className="absolute right-4 rounded-full bg-card/80 p-3 text-white hover:bg-accent transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              style={{ top: "max(1rem, env(safe-area-inset-top, 1rem))" }}
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={src}
              alt={alt ?? ""}
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
