"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "@/store/chat-store";
import { MessageBubble } from "./message-bubble";
import { TypingIndicator } from "./typing-indicator";
import { ChatInput } from "./chat-input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { X, Loader2, MessageSquare } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useRenderDiag } from "@/lib/chat-diagnostics";

const EMPTY: never[] = [];

export function ThreadPanel() {
  const { t } = useTranslation();
  const activeThreadId = useChatStore((s) => s.activeThreadId);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const closeThread = useChatStore((s) => s.closeThread);
  const threadMessages = useChatStore((s) => activeThreadId ? (s.threadMessages[activeThreadId] ?? EMPTY) : EMPTY);
  const threadLoading = useChatStore((s) => s.threadLoading);
  const messagesByConversation = useChatStore((s) => s.messagesByConversation);
  const thinkingAgents = useChatStore((s) =>
    activeConversationId ? (s.thinkingAgents[activeConversationId] ?? EMPTY) : EMPTY
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  useRenderDiag("ThreadPanel", () => ({
    activeThreadId,
    activeConversationId,
    threadLoading,
    threadMessageCount: threadMessages.length,
  }));

  // Find the original (parent) message
  const originalMessage = activeConversationId && activeThreadId
    ? (messagesByConversation[activeConversationId] ?? []).find((m) => m.id === activeThreadId)
    : null;

  // Deduplicate thread messages
  const messages = threadMessages.filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);

  // Auto-scroll to bottom on new messages
  const lastMsg = messages[messages.length - 1];
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNewMessage = messages.length > prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;
    // Always scroll on new message; for streaming updates, only if near bottom
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (isNewMessage || isNearBottom) {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: isNewMessage ? "smooth" : "auto" });
      });
    }
  }, [lastMsg?.content, lastMsg?.status, messages.length]);

  // Check if any agent is thinking in thread context
  const threadThinking = thinkingAgents.length > 0;

  return (
    <Sheet open={!!activeThreadId} onOpenChange={(open) => { if (!open) closeThread(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:w-[380px] sm:max-w-[380px] p-0 flex flex-col"
      >
        {/* Thread Header */}
        <SheetHeader className="px-4 pb-3 border-b shrink-0" style={{ paddingTop: "calc(1rem + env(safe-area-inset-top, 0px))" }}>
          <div className="flex items-center justify-between">
            <SheetTitle className="text-sm flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4" />
              {t("chat.thread.title")}
            </SheetTitle>
            <Button variant="ghost" size="icon-xs" onClick={closeThread} className="h-6 w-6">
              <X className="h-4 w-4" />
            </Button>
          </div>
          {/* Original message preview */}
          {originalMessage && (
            <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
              {originalMessage.senderAgentName && (
                <p className="text-xs font-medium text-blue-400 mb-0.5">
                  {originalMessage.senderAgentName}
                </p>
              )}
              {originalMessage.senderUserName && !originalMessage.senderAgentName && (
                <p className="text-xs font-medium text-emerald-400 mb-0.5">
                  {originalMessage.senderUserName}
                </p>
              )}
              <p className="text-muted-foreground line-clamp-3 whitespace-pre-wrap break-words">
                {originalMessage.content}
              </p>
            </div>
          )}
        </SheetHeader>

        {/* Thread Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 min-h-0">
          {threadLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">{t("chat.thread.noReplies")}</p>
              <p className="text-xs mt-1">{t("chat.thread.startDiscussion")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((msg) => (
                <div key={msg.id}>
                  {msg.role === "system" ? (
                    <div className="flex justify-center py-1.5">
                      <span className="text-xs text-muted-foreground bg-muted/50 rounded-full px-3 py-1">
                        {msg.content}
                      </span>
                    </div>
                  ) : (
                    <MessageBubble
                      message={msg}
                      isGroupConversation={true}
                      isInThread
                    />
                  )}
                </div>
              ))}
              {threadThinking && activeConversationId && (
                <TypingIndicator conversationId={activeConversationId} />
              )}
            </div>
          )}
        </div>

        {/* Thread Input — reuse full ChatInput with thread context */}
        <div className="border-t shrink-0">
          <ChatInput threadId={activeThreadId} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
