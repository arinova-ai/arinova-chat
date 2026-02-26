"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "@/store/chat-store";
import { MessageBubble } from "./message-bubble";
import { TypingIndicator } from "./typing-indicator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { X, Send, Loader2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThreadPanel() {
  const activeThreadId = useChatStore((s) => s.activeThreadId);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const closeThread = useChatStore((s) => s.closeThread);
  const threadMessages = useChatStore((s) => activeThreadId ? (s.threadMessages[activeThreadId] ?? []) : []);
  const threadLoading = useChatStore((s) => s.threadLoading);
  const sendThreadMessage = useChatStore((s) => s.sendThreadMessage);
  const messagesByConversation = useChatStore((s) => s.messagesByConversation);
  const thinkingAgents = useChatStore((s) =>
    activeConversationId ? (s.thinkingAgents[activeConversationId] ?? []) : []
  );

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Find the original (parent) message
  const originalMessage = activeConversationId && activeThreadId
    ? (messagesByConversation[activeConversationId] ?? []).find((m) => m.id === activeThreadId)
    : null;

  // Deduplicate thread messages
  const messages = threadMessages.filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);

  // Auto-scroll to bottom on new messages
  const lastMsg = messages[messages.length - 1];
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Only auto-scroll if already near bottom
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (isNearBottom) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [lastMsg?.content, lastMsg?.status, messages.length]);

  // Focus textarea when thread opens
  useEffect(() => {
    if (activeThreadId) {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [activeThreadId]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    sendThreadMessage(text);
    setInput("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, sendThreadMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, []);

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
        <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-sm flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4" />
              Thread
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
              <p className="text-sm">No replies yet</p>
              <p className="text-xs mt-1">Start the discussion below</p>
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

        {/* Thread Input */}
        <div className="border-t px-3 py-3 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Reply in thread..."
              rows={1}
              className={cn(
                "flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm",
                "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                "max-h-[120px]"
              )}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim()}
              className="h-9 w-9 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
