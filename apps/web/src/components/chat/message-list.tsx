"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "@arinova/shared/types";
import { MessageBubble } from "./message-bubble";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { useChatStore } from "@/store/chat-store";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageListProps {
  messages: Message[];
  agentName?: string;
}

export function MessageList({ messages: rawMessages, agentName }: MessageListProps) {
  // Deduplicate by ID (around-cursor + WS events can produce overlaps)
  const messages = rawMessages.filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);
  const lastMessage = messages[messages.length - 1];
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const highlightMessageId = useChatStore((s) => s.highlightMessageId);
  const [loadingUp, setLoadingUp] = useState(false);
  const [loadingDown, setLoadingDown] = useState(false);
  const [hasMoreUp, setHasMoreUp] = useState(true);
  const [hasMoreDown, setHasMoreDown] = useState(false);
  const highlightRef = useRef<HTMLDivElement>(null);

  const scrollRef = useAutoScroll<HTMLDivElement>([
    lastMessage?.content,
    lastMessage?.status,
    messages.length,
  ]);

  // Scroll to highlighted message when it appears
  useEffect(() => {
    if (highlightMessageId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightMessageId, messages]);

  const loadOlder = useCallback(async () => {
    if (loadingUp || !hasMoreUp || !activeConversationId || messages.length === 0)
      return;

    setLoadingUp(true);
    try {
      const firstMsg = messages[0];
      const data = await api<{ messages: Message[]; hasMore: boolean }>(
        `/api/conversations/${activeConversationId}/messages?before=${firstMsg.id}&limit=50`
      );

      if (data.messages.length > 0) {
        const el = scrollRef.current;
        const prevScrollHeight = el?.scrollHeight ?? 0;

        const store = useChatStore.getState();
        const current = store.messagesByConversation[activeConversationId] ?? [];
        useChatStore.setState({
          messagesByConversation: {
            ...store.messagesByConversation,
            [activeConversationId]: [...data.messages, ...current],
          },
        });

        // Preserve scroll position after prepending
        requestAnimationFrame(() => {
          if (el) {
            el.scrollTop += el.scrollHeight - prevScrollHeight;
          }
        });
      }

      setHasMoreUp(data.hasMore);
    } catch {
      // ignore
    } finally {
      setLoadingUp(false);
    }
  }, [loadingUp, hasMoreUp, activeConversationId, messages, scrollRef]);

  const loadNewer = useCallback(async () => {
    if (loadingDown || !hasMoreDown || !activeConversationId || messages.length === 0)
      return;

    setLoadingDown(true);
    try {
      const lastMsg = messages[messages.length - 1];
      const data = await api<{ messages: Message[]; hasMoreDown: boolean }>(
        `/api/conversations/${activeConversationId}/messages?after=${lastMsg.id}&limit=50`
      );

      if (data.messages.length > 0) {
        const store = useChatStore.getState();
        const current = store.messagesByConversation[activeConversationId] ?? [];
        useChatStore.setState({
          messagesByConversation: {
            ...store.messagesByConversation,
            [activeConversationId]: [...current, ...data.messages],
          },
        });
      }

      setHasMoreDown(data.hasMoreDown ?? false);
    } catch {
      // ignore
    } finally {
      setLoadingDown(false);
    }
  }, [loadingDown, hasMoreDown, activeConversationId, messages]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Load older when scrolled near top
    if (el.scrollTop < 100 && hasMoreUp && !loadingUp) {
      loadOlder();
    }
    // Load newer when scrolled near bottom
    const bottomDist = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (bottomDist < 100 && hasMoreDown && !loadingDown) {
      loadNewer();
    }
  }, [hasMoreUp, hasMoreDown, loadingUp, loadingDown, loadOlder, loadNewer, scrollRef]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto overflow-x-hidden py-4"
      onScroll={handleScroll}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {loadingUp && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            ref={message.id === highlightMessageId ? highlightRef : undefined}
            className={cn(
              "transition-colors duration-1000",
              message.id === highlightMessageId && "search-highlight"
            )}
          >
            <MessageBubble
              message={message}
              agentName={message.role === "agent" ? agentName : undefined}
            />
          </div>
        ))}
        {loadingDown && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
