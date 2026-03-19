"use client";

import { useState, useEffect, useCallback } from "react";
import { Info, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "arinova_tooltip_dismissed";
const STORAGE_INDEX_KEY = "arinova_tooltip_index";
const ROTATE_INTERVAL = 8000; // 8 seconds

/** Tips keys — content comes from i18n */
const TIPS_DESKTOP = [
  "tips.slashCommands",
  "tips.mentionAgent",
  "tips.dragFiles",
  "tips.markdown",
  "tips.enterSend",
  "tips.searchMessages",
  "tips.pinMessages",
  "tips.voiceMessage",
  "tips.reactions",
  "tips.threads",
  "tips.dateJump",
  "tips.blockUser",
  "tips.muteConversation",
  "tips.noteSharing",
  "tips.shortcuts",
] as const;

const TIPS_MOBILE = [
  "tips.slashCommands",
  "tips.mentionAgent",
  "tips.tapSend",
  "tips.longPressReact",
  "tips.swipeReply",
  "tips.voiceMessage",
  "tips.searchMessages",
  "tips.pinMessages",
  "tips.reactions",
  "tips.threads",
  "tips.dateJump",
  "tips.blockUser",
  "tips.muteConversation",
  "tips.noteSharing",
  "tips.pullRefresh",
] as const;

export function ChatTooltip() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(true);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const tips = isMobile ? TIPS_MOBILE : TIPS_DESKTOP;

  // Load persisted state
  useEffect(() => {
    const d = localStorage.getItem(STORAGE_KEY);
    setDismissed(d === "true");
    const savedIdx = parseInt(localStorage.getItem(STORAGE_INDEX_KEY) ?? "0", 10);
    setIndex(savedIdx % tips.length);
  }, [tips.length]);

  // Auto-rotate when open
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % tips.length;
        localStorage.setItem(STORAGE_INDEX_KEY, String(next));
        return next;
      });
    }, ROTATE_INTERVAL);
    return () => clearInterval(timer);
  }, [open, tips.length]);

  const handleDismissForever = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
    setOpen(false);
  }, []);

  const handleToggle = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  if (dismissed) return null;

  const tipKey = tips[index];
  const tipText = t(tipKey as string) || tipKey;
  const progress = `${index + 1}/${tips.length}`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        title={t("tips.title") || "Tips"}
      >
        <Info className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-64 rounded-lg border bg-popover p-3 shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-popover-foreground leading-relaxed">
              {tipText}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">{progress}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = (index + 1) % tips.length;
                  setIndex(next);
                  localStorage.setItem(STORAGE_INDEX_KEY, String(next));
                }}
                className="text-[10px] text-primary hover:underline font-medium"
              >
                {t("tips.next") || "Next"}
              </button>
              <button
                type="button"
                onClick={handleDismissForever}
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
              >
                {t("tips.dontShowAgain") || "Don't show again"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
