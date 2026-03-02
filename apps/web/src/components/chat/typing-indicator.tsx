"use client";

import { useChatStore } from "@/store/chat-store";
import { Bot, Clock, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

const EMPTY_TYPING_USERS: { userId: string; userName: string; expiresAt: number }[] = [];

export function TypingIndicator({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const thinking = useChatStore((s) => s.thinkingAgents[conversationId]);
  const cancelAgentStream = useChatStore((s) => s.cancelAgentStream);
  const typingUsers = useChatStore((s) => s.typingUsers[conversationId] ?? EMPTY_TYPING_USERS);

  const activeTypingUsers = typingUsers.filter((u) => u.expiresAt > Date.now());
  const hasThinking = thinking && thinking.length > 0;

  if (!hasThinking && activeTypingUsers.length === 0) return null;

  // Only show queued agents WITHOUT a messageId in the global indicator
  // (agents with messageId are shown per-message in message-bubble.tsx)
  const queued = hasThinking ? thinking.filter((a) => a.queued && !a.messageId) : [];
  const active = hasThinking ? thinking.filter((a) => !a.queued) : [];

  return (
    <>
      {queued.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 text-yellow-500" />
          <span>
            {queued.map((a) => a.agentName).join(", ")} {t("chat.status.queuedLabel")}
          </span>
        </div>
      )}
      {active.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
          <Bot className="h-4 w-4 animate-pulse" />
          <span className="flex items-center gap-1.5 flex-wrap">
            {active.map((a, i) => (
              <span key={a.agentId} className="inline-flex items-center">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                  {a.agentName}
                  {a.messageId && (
                    <button
                      type="button"
                      onClick={() => cancelAgentStream(conversationId, a.messageId)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
                      aria-label={`Stop ${a.agentName}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
                {i < active.length - 1 && <span className="sr-only">,</span>}
              </span>
            ))}
            <span>
              {t("chat.status.thinking")}
              <span className="inline-flex w-6">
                <span className="animate-pulse">...</span>
              </span>
            </span>
          </span>
        </div>
      )}
      {activeTypingUsers.length > 0 && (
        <div className="flex items-center gap-1 px-4 py-1 text-xs text-muted-foreground">
          <span>{activeTypingUsers.map((u) => u.userName).join(", ")} is typing</span>
          <span className="animate-pulse">...</span>
        </div>
      )}
    </>
  );
}
