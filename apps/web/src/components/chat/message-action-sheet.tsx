"use client";

import type { Message } from "@arinova/shared/types";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Copy, Trash2, RotateCcw, Reply } from "lucide-react";
import { VisuallyHidden } from "radix-ui";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🤔", "👀"];

interface MessageActionSheetProps {
  message: Message | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCopy: () => void;
  onDelete: () => void;
  onRetry: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
}

const ACTION_BUTTON =
  "flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm text-neutral-100 active:bg-neutral-700";

export function MessageActionSheet({
  message,
  open,
  onOpenChange,
  onCopy,
  onDelete,
  onRetry,
  onReply,
  onReact,
}: MessageActionSheetProps) {
  if (!message) return null;

  const isError = message.status === "error";

  const handle = (action: () => void) => {
    action();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="rounded-t-2xl border-neutral-700 bg-neutral-800 px-2 pb-6 pt-3"
      >
        <VisuallyHidden.Root>
          <SheetTitle>Message actions</SheetTitle>
        </VisuallyHidden.Root>

        {/* Drag handle */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-600" />

        {/* Quick emoji reactions */}
        <div className="mb-2 flex justify-center gap-2 px-2">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handle(() => onReact(emoji))}
              className="rounded-full p-2 text-xl active:bg-neutral-700"
            >
              {emoji}
            </button>
          ))}
        </div>

        <div className="h-px bg-neutral-700" />

        <div className="mt-1 flex flex-col">
          <button className={ACTION_BUTTON} onClick={() => handle(onCopy)}>
            <Copy className="h-4 w-4 text-neutral-400" />
            Copy
          </button>
          <button className={ACTION_BUTTON} onClick={() => handle(onReply)}>
            <Reply className="h-4 w-4 text-blue-400" />
            <span className="text-blue-400">Reply</span>
          </button>
          {isError && (
            <button className={ACTION_BUTTON} onClick={() => handle(onRetry)}>
              <RotateCcw className="h-4 w-4 text-blue-400" />
              <span className="text-blue-400">Retry</span>
            </button>
          )}
          <button className={ACTION_BUTTON} onClick={() => handle(onDelete)}>
            <Trash2 className="h-4 w-4 text-red-400" />
            <span className="text-red-400">Delete</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
