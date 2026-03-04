"use client";

import { useEffect, useRef, useState } from "react";
import type { Message } from "@arinova/shared/types";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Copy, Trash2, RotateCcw, Reply, Pin, PinOff, MessageSquare, Flag, CheckSquare } from "lucide-react";
import { VisuallyHidden } from "radix-ui";
import { useTranslation } from "@/lib/i18n";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🤔", "👀"];
/** Guard duration (ms) to ignore accidental touch after long-press opens sheet */
const INTERACTION_GUARD_MS = 300;

interface MessageActionSheetProps {
  message: Message | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCopy: () => void;
  onDelete: () => void;
  onRetry: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onPin?: () => void;
  isPinned?: boolean;
  onStartThread?: () => void;
  onReport?: () => void;
  isInThread?: boolean;
  onSelect?: () => void;
}

const ACTION_BUTTON =
  "flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm text-foreground active:bg-accent";

export function MessageActionSheet({
  message,
  open,
  onOpenChange,
  onCopy,
  onDelete,
  onRetry,
  onReply,
  onReact,
  onPin,
  isPinned,
  onStartThread,
  onReport,
  isInThread,
  onSelect,
}: MessageActionSheetProps) {
  const { t } = useTranslation();
  // Interaction guard: block accidental taps right after the sheet opens (from long-press release)
  const [guarded, setGuarded] = useState(false);
  const guardTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (open) {
      setGuarded(true);
      guardTimer.current = setTimeout(() => setGuarded(false), INTERACTION_GUARD_MS);
    } else {
      setGuarded(false);
    }
    return () => clearTimeout(guardTimer.current);
  }, [open]);

  if (!message) return null;

  const isError = message.status === "error";

  const handle = (action: () => void) => {
    if (guarded) return; // ignore accidental touch
    onOpenChange(false);
    // Run action after sheet starts closing — ensures clipboard calls
    // happen outside the dialog overlay context (avoids focus-loss issues on mobile Safari)
    requestAnimationFrame(() => action());
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="rounded-t-2xl border-border bg-secondary px-2 pt-3"
        style={{
          paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
          pointerEvents: guarded ? "none" : undefined,
        }}
      >
        <VisuallyHidden.Root>
          <SheetTitle>{t("chat.messageActions")}</SheetTitle>
        </VisuallyHidden.Root>

        {/* Drag handle */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />

        {/* Quick emoji reactions */}
        <div className="mb-2 flex justify-center gap-2 px-2">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handle(() => onReact(emoji))}
              className="rounded-full p-2 text-xl active:bg-accent"
            >
              {emoji}
            </button>
          ))}
        </div>

        <div className="h-px bg-accent" />

        <div className="mt-1 flex flex-col">
          <button className={ACTION_BUTTON} onClick={() => handle(onCopy)}>
            <Copy className="h-4 w-4 text-muted-foreground" />
            {t("common.copy")}
          </button>
          {onSelect && (
            <button className={ACTION_BUTTON} onClick={() => handle(onSelect)}>
              <CheckSquare className="h-4 w-4 text-blue-400" />
              <span className="text-blue-400">{t("chat.actions.select")}</span>
            </button>
          )}
          <button className={ACTION_BUTTON} onClick={() => handle(onReply)}>
            <Reply className="h-4 w-4 text-blue-400" />
            <span className="text-blue-400">{t("chat.actions.reply")}</span>
          </button>
          {!isInThread && onStartThread && (
            <button className={ACTION_BUTTON} onClick={() => handle(onStartThread)}>
              <MessageSquare className="h-4 w-4 text-blue-400" />
              <span className="text-blue-400">{t("chat.actions.startThread")}</span>
            </button>
          )}
          {onPin && (
            <button className={ACTION_BUTTON} onClick={() => handle(onPin)}>
              {isPinned ? (
                <PinOff className="h-4 w-4 text-yellow-400" />
              ) : (
                <Pin className="h-4 w-4 text-yellow-400" />
              )}
              <span className="text-yellow-400">{isPinned ? "Unpin" : "Pin"}</span>
            </button>
          )}
          {onReport && (
            <button className={ACTION_BUTTON} onClick={() => handle(onReport)}>
              <Flag className="h-4 w-4 text-orange-400" />
              <span className="text-orange-400">Report</span>
            </button>
          )}
          {isError && (
            <button className={ACTION_BUTTON} onClick={() => handle(onRetry)}>
              <RotateCcw className="h-4 w-4 text-blue-400" />
              <span className="text-blue-400">{t("common.retry")}</span>
            </button>
          )}
          <button className={ACTION_BUTTON} onClick={() => handle(onDelete)}>
            <Trash2 className="h-4 w-4 text-red-400" />
            <span className="text-red-400">{t("common.delete")}</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
