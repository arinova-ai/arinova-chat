"use client";

import { useChatStore } from "@/store/chat-store";
import { Bot } from "lucide-react";

export function TypingIndicator({ conversationId }: { conversationId: string }) {
  const thinking = useChatStore((s) => s.thinkingAgents[conversationId]);

  if (!thinking || thinking.length === 0) return null;

  const names = thinking.map((t) => t.agentName).join(", ");

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
      <Bot className="h-4 w-4 animate-pulse" />
      <span>
        {names} thinking
        <span className="inline-flex w-6">
          <span className="animate-pulse">...</span>
        </span>
      </span>
    </div>
  );
}
