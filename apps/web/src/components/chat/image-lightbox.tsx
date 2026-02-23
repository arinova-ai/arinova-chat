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
            onClick={() => setOpen(false)}
          >
            <button
              className="absolute top-4 right-4 rounded-full bg-neutral-800/80 p-2 text-white hover:bg-neutral-700 transition-colors"
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={src}
              alt={alt ?? ""}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
