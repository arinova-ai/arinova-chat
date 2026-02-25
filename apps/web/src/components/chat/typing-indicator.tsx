"use client";

import { useChatStore } from "@/store/chat-store";
import { Bot, Clock } from "lucide-react";

export function TypingIndicator({ conversationId }: { conversationId: string }) {
  const thinking = useChatStore((s) => s.thinkingAgents[conversationId]);

  if (!thinking || thinking.length === 0) return null;

  const queued = thinking.filter((t) => t.queued);
  const active = thinking.filter((t) => !t.queued);

  return (
    <>
      {queued.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 text-yellow-500" />
          <span>
            {queued.map((t) => t.agentName).join(", ")} queued
          </span>
        </div>
      )}
      {active.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
          <Bot className="h-4 w-4 animate-pulse" />
          <span>
            {active.map((t) => t.agentName).join(", ")} thinking
            <span className="inline-flex w-6">
              <span className="animate-pulse">...</span>
            </span>
          </span>
        </div>
      )}
    </>
  );
}
