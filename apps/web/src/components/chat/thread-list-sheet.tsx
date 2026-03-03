"use client";

import type { Message } from "@arinova/shared/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MessageSquare } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { useTranslation } from "@/lib/i18n";

interface ThreadListSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: Message[];
}

function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

export function ThreadListSheet({ open, onOpenChange, messages }: ThreadListSheetProps) {
  const { t } = useTranslation();
  const openThread = useChatStore((s) => s.openThread);

  const threaded = messages.filter(
    (m) => !m.threadId && m.threadSummary && m.threadSummary.replyCount > 0
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="rounded-t-2xl border-border bg-secondary px-2 pb-6 pt-3 max-h-[70vh]"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />

        <SheetHeader className="px-2 pb-3">
          <SheetTitle className="text-sm flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4" />
            {t("chat.thread.title")}
          </SheetTitle>
        </SheetHeader>

        <div className="overflow-y-auto max-h-[55vh] px-1">
          {threaded.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">{t("chat.thread.noReplies")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {threaded.map((msg) => (
                <button
                  key={msg.id}
                  type="button"
                  className="flex items-start gap-3 rounded-lg px-3 py-2.5 text-left active:bg-accent hover:bg-accent/60 transition-colors"
                  onClick={() => {
                    openThread(msg.id);
                    onOpenChange(false);
                  }}
                >
                  <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-blue-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm line-clamp-2 break-words">
                      {msg.content || "..."}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {msg.threadSummary!.replyCount}{" "}
                        {msg.threadSummary!.replyCount === 1 ? t("chat.replies.one") : t("chat.replies.other")}
                      </span>
                      <span>·</span>
                      <span>{formatTime(msg.threadSummary!.lastReplyAt)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
