"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "@arinova/shared/types";
import { MessageBubble } from "./message-bubble";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { useChatStore } from "@/store/chat-store";
import { api } from "@/lib/api";
import { ArrowDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TypingIndicator } from "./typing-indicator";

interface MessageListProps {
  messages: Message[];
  agentName?: string;
  isGroupConversation?: boolean;
}

export function MessageList({ messages: rawMessages, agentName, isGroupConversation }: MessageListProps) {
  // Filter out thread messages (they display in the thread panel only) + deduplicate
  const messages = rawMessages
    .filter((m) => !m.threadId)
    .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);
  const lastMessage = messages[messages.length - 1];
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const highlightMessageId = useChatStore((s) => s.highlightMessageId);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const thinkingCount = useChatStore((s) => activeConversationId ? (s.thinkingAgents[activeConversationId]?.length ?? 0) : 0);
  const [loadingUp, setLoadingUp] = useState(false);
  const [loadingDown, setLoadingDown] = useState(false);
  const [hasMoreUp, setHasMoreUp] = useState(true);
  const [hasMoreDown, setHasMoreDown] = useState(false);
  const loadingUpRef = useRef(false);
  const loadingDownRef = useRef(false);
  const highlightRef = useRef<HTMLDivElement>(null);

  const { ref: scrollRef, showScrollButton, scrollToBottom } = useAutoScroll<HTMLDivElement>(
    [lastMessage?.content, lastMessage?.status, messages.length, thinkingCount],
    { conversationId: activeConversationId, skipScroll: !!highlightMessageId, messageCount: messages.length },
  );

  // Scroll to highlighted message (and matching text within it) when it appears
  useEffect(() => {
    if (!highlightMessageId || !highlightRef.current) return;

    requestAnimationFrame(() => {
      const el = highlightRef.current;
      const container = scrollRef.current;
      if (!el || !container) return;

      const query = useChatStore.getState().searchQuery?.toLowerCase();

      // Try to find the matching text node inside the message
      if (query) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node: Text | null;
        while ((node = walker.nextNode() as Text | null)) {
          const idx = node.textContent?.toLowerCase().indexOf(query) ?? -1;
          if (idx >= 0) {
            // Found — get bounding rect of the matched text and center it
            const range = document.createRange();
            range.setStart(node, idx);
            range.setEnd(node, idx + query.length);
            const rect = range.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const offset = rect.top - containerRect.top + container.scrollTop;
            container.scrollTo({
              top: offset - containerRect.height / 2,
              behavior: "smooth",
            });
            return;
          }
        }
      }

      // Fallback: center the whole message
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [highlightMessageId, messages, scrollRef]);

  const loadOlder = useCallback(async () => {
    if (loadingUpRef.current || !hasMoreUp || !activeConversationId || messages.length === 0)
      return;

    loadingUpRef.current = true;
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
      loadingUpRef.current = false;
      setLoadingUp(false);
    }
  }, [hasMoreUp, activeConversationId, messages, scrollRef]);

  const loadNewer = useCallback(async () => {
    if (loadingDownRef.current || !hasMoreDown || !activeConversationId || messages.length === 0)
      return;

    loadingDownRef.current = true;
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
      loadingDownRef.current = false;
      setLoadingDown(false);
    }
  }, [hasMoreDown, activeConversationId, messages]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Load older when scrolled near top
    if (el.scrollTop < 100 && hasMoreUp && !loadingUpRef.current) {
      loadOlder();
    }
    // Load newer when scrolled near bottom
    const bottomDist = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (bottomDist < 100 && hasMoreDown && !loadingDownRef.current) {
      loadNewer();
    }
  }, [hasMoreUp, hasMoreDown, loadOlder, loadNewer, scrollRef]);

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overflow-x-hidden py-4"
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
              {message.role === "system" ? (
                <div className="flex justify-center py-1.5">
                  <span className="text-xs text-muted-foreground bg-muted/50 rounded-full px-3 py-1">
                    {message.content}
                  </span>
                </div>
              ) : (
                <MessageBubble
                  message={message}
                  agentName={message.role === "agent" ? agentName : undefined}
                  highlightQuery={message.id === highlightMessageId ? searchQuery : undefined}
                  isGroupConversation={isGroupConversation}
                />
              )}
            </div>
          ))}
          {loadingDown && (
            <div className="flex justify-center py-2">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {activeConversationId && (
            <TypingIndicator conversationId={activeConversationId} />
          )}
        </div>
      </div>

      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card shadow-lg transition-opacity hover:bg-accent"
          aria-label="Scroll to latest"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
