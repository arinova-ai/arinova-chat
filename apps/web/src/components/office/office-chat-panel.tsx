"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "@/store/chat-store";
import { MessageBubble } from "@/components/chat/message-bubble";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { X, Send, Loader2, MessageSquare } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

const EMPTY: never[] = [];

interface OfficeChatPanelProps {
  open: boolean;
  onClose: () => void;
  agentId: string;
}

export function OfficeChatPanel({ open, onClose, agentId }: OfficeChatPanelProps) {
  const { t } = useTranslation();
  const conversations = useChatStore((s) => s.conversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const messagesByConversation = useChatStore((s) => s.messagesByConversation);
  const thinkingAgents = useChatStore((s) => s.thinkingAgents);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [initializing, setInitializing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevActiveRef = useRef<string | null>(null);

  // Find or create conversation when panel opens
  useEffect(() => {
    if (!open || !agentId) return;
    let cancelled = false;

    const existing = conversations.find(
      (c) => c.agentId === agentId && c.type === "direct"
    );

    if (existing) {
      setConversationId(existing.id);
      prevActiveRef.current = useChatStore.getState().activeConversationId;
      setActiveConversation(existing.id);
      loadMessages(existing.id);
    } else {
      setInitializing(true);
      createConversation(agentId)
        .then((conv) => {
          if (cancelled) return;
          setConversationId(conv.id);
          prevActiveRef.current = useChatStore.getState().activeConversationId;
          setActiveConversation(conv.id);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setInitializing(false);
        });
    }

    return () => { cancelled = true; };
  }, [open, agentId, conversations, createConversation, setActiveConversation, loadMessages]);

  // Restore previous activeConversationId on close
  const handleClose = useCallback(() => {
    if (prevActiveRef.current != null) {
      setActiveConversation(prevActiveRef.current);
    }
    setConversationId(null);
    onClose();
  }, [onClose, setActiveConversation]);

  const messages = conversationId
    ? (messagesByConversation[conversationId] ?? EMPTY)
    : EMPTY;

  const thinking = conversationId
    ? (thinkingAgents[conversationId] ?? EMPTY)
    : EMPTY;

  // Auto-scroll
  const lastMsg = messages[messages.length - 1];
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (isNearBottom) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [lastMsg?.content, lastMsg?.status, messages.length]);

  // Focus textarea
  useEffect(() => {
    if (open && conversationId) {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [open, conversationId]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !conversationId) return;
    sendMessage(text);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, conversationId, sendMessage]);

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
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, []);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:w-[380px] sm:max-w-[380px] p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-sm flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4" />
              {t("nav.chat")}
            </SheetTitle>
            <Button variant="ghost" size="icon-xs" onClick={handleClose} className="h-6 w-6">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 min-h-0">
          {initializing ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">{t("officeChat.startConversation")}</p>
            </div>
          ) : (
            <div className="space-y-1 px-3">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} isInThread />
              ))}
            </div>
          )}

          {/* Typing indicator */}
          {conversationId && thinking.length > 0 && (
            <div className="px-3 mt-1">
              <TypingIndicator conversationId={conversationId} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t px-3 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={t("officeChat.placeholder")}
              rows={1}
              className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={handleSend}
              disabled={!input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
