"use client";

import { useChatStore } from "@/store/chat-store";
import { Bot, Clock, X } from "lucide-react";

export function TypingIndicator({ conversationId }: { conversationId: string }) {
  const thinking = useChatStore((s) => s.thinkingAgents[conversationId]);
  const cancelAgentStream = useChatStore((s) => s.cancelAgentStream);

  if (!thinking || thinking.length === 0) return null;

  // Only show queued agents WITHOUT a messageId in the global indicator
  // (agents with messageId are shown per-message in message-bubble.tsx)
  const queued = thinking.filter((t) => t.queued && !t.messageId);
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
          <span className="flex items-center gap-1.5 flex-wrap">
            {active.map((t, i) => (
              <span key={t.agentId} className="inline-flex items-center">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                  {t.agentName}
                  {t.messageId && (
                    <button
                      type="button"
                      onClick={() => cancelAgentStream(conversationId, t.messageId)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
                      aria-label={`Stop ${t.agentName}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
                {i < active.length - 1 && <span className="sr-only">,</span>}
              </span>
            ))}
            <span>
              thinking
              <span className="inline-flex w-6">
                <span className="animate-pulse">...</span>
              </span>
            </span>
          </span>
        </div>
      )}
    </>
  );
}
