"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/store/chat-store";

export function ReplyPreview() {
  const replyingTo = useChatStore((s) => s.replyingTo);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);

  if (!replyingTo) return null;

  const senderName =
    replyingTo.senderAgentName ??
    (replyingTo.role === "user" ? "You" : "Agent");
  const snippet =
    replyingTo.content.length > 100
      ? replyingTo.content.slice(0, 100) + "..."
      : replyingTo.content;

  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-blue-400/50 bg-neutral-800 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-blue-400">{senderName}</p>
        <p className="truncate text-xs text-muted-foreground">{snippet}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => setReplyingTo(null)}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
