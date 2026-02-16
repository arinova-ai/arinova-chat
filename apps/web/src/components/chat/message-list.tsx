"use client";

import { useCallback, useState } from "react";
import type { Message } from "@arinova/shared/types";
import { MessageBubble } from "./message-bubble";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { useChatStore } from "@/store/chat-store";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface MessageListProps {
  messages: Message[];
  agentName?: string;
}

export function MessageList({ messages, agentName }: MessageListProps) {
  const lastMessage = messages[messages.length - 1];
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const scrollRef = useAutoScroll<HTMLDivElement>([
    lastMessage?.content,
    lastMessage?.status,
    messages.length,
  ]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !activeConversationId || messages.length === 0)
      return;

    setLoadingMore(true);
    try {
      const firstMsg = messages[0];
      const data = await api<{ messages: Message[]; hasMore: boolean }>(
        `/api/conversations/${activeConversationId}/messages?before=${firstMsg.id}&limit=50`
      );

      if (data.messages.length > 0) {
        const store = useChatStore.getState();
        const current = store.messagesByConversation[activeConversationId] ?? [];
        useChatStore.setState({
          messagesByConversation: {
            ...store.messagesByConversation,
            [activeConversationId]: [...data.messages, ...current],
          },
        });
      }

      setHasMore(data.hasMore);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, activeConversationId, messages]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Load more when scrolled near top
    if (el.scrollTop < 100 && hasMore && !loadingMore) {
      loadMore();
    }
  }, [hasMore, loadingMore, loadMore, scrollRef]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto overflow-x-hidden py-4"
      onScroll={handleScroll}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {loadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            agentName={message.role === "agent" ? agentName : undefined}
          />
        ))}
      </div>
    </div>
  );
}
