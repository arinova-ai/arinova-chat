"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { Message } from "@arinova/shared/types";
import { MessageBubble } from "./message-bubble";
import { useChatStore } from "@/store/chat-store";
import { api } from "@/lib/api";
import { ArrowDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TypingIndicator } from "./typing-indicator";
import { useTranslation } from "@/lib/i18n";
import { diagCount, useRenderDiag } from "@/lib/chat-diagnostics";

interface MessageListProps {
  messages: Message[];
  agentName?: string;
  isGroupConversation?: boolean;
}

function MessageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-4">
      <div className="flex justify-start">
        <div className="h-10 w-48 animate-pulse rounded-2xl bg-muted" />
      </div>
      <div className="flex justify-end">
        <div className="h-10 w-56 animate-pulse rounded-2xl bg-muted" />
      </div>
      <div className="flex justify-start">
        <div className="h-16 w-64 animate-pulse rounded-2xl bg-muted" />
      </div>
      <div className="flex justify-end">
        <div className="h-10 w-40 animate-pulse rounded-2xl bg-muted" />
      </div>
      <div className="flex justify-start">
        <div className="h-10 w-52 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}

const START_INDEX = 100_000;

export function MessageList({ messages: rawMessages, agentName, isGroupConversation }: MessageListProps) {
  const { t } = useTranslation();
  const loadingMessages = useChatStore((s) => s.loadingMessages);

  // Filter out thread messages (they display in the thread panel only) + deduplicate
  const messages = rawMessages
    .filter((m) => !m.threadId)
    .filter((m) => m.status === "streaming" || m.content?.trim() || m.attachments?.length)
    .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);

  const lastMessage = messages[messages.length - 1];
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const highlightMessageId = useChatStore((s) => s.highlightMessageId);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const convSearchQuery = useChatStore((s) => s.convSearchQuery);
  const jumpPagination = useChatStore((s) => s.jumpPagination);
  const unreadDividerMessageId = useChatStore((s) => s.unreadDividerMessageId);

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [firstItemIndex, setFirstItemIndex] = useState(START_INDEX);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [loadingUp, setLoadingUp] = useState(false);
  const [loadingDown, setLoadingDown] = useState(false);
  const [hasMoreUp, setHasMoreUp] = useState(jumpPagination?.hasMoreUp ?? true);
  const [hasMoreDown, setHasMoreDown] = useState(jumpPagination?.hasMoreDown ?? false);

  const loadingRef = useRef(false);
  const messagesRef = useRef(messages);
  const atBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);
  const isPrependingRef = useRef(false);

  useRenderDiag("MessageList", () => ({
    activeConversationId,
    count: messages.length,
    hasMoreUp,
    hasMoreDown,
    loadingUp,
    loadingDown,
  }));

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Sync pagination from jumpToMessage
  useEffect(() => {
    if (jumpPagination) {
      setHasMoreUp((prev) => (prev === jumpPagination.hasMoreUp ? prev : jumpPagination.hasMoreUp));
      setHasMoreDown((prev) => (prev === jumpPagination.hasMoreDown ? prev : jumpPagination.hasMoreDown));
    }
  }, [jumpPagination]);

  // Scroll to highlighted message when it appears
  useEffect(() => {
    if (!highlightMessageId) return;
    const idx = messages.findIndex((m) => m.id === highlightMessageId);
    if (idx === -1) return;

    setTimeout(() => {
      virtuosoRef.current?.scrollToIndex({
        index: idx,
        align: "center",
        behavior: "smooth",
      });
    }, 100);
  }, [highlightMessageId, messages]);

  // Track new messages for badge count
  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    const currentCount = messages.length;
    prevMessageCountRef.current = currentCount;

    if (currentCount > prevCount && !atBottomRef.current && !isPrependingRef.current) {
      setNewMessageCount((prev) => prev + (currentCount - prevCount));
    }
  }, [messages.length]);

  // Load older messages (triggered by startReached)
  const loadOlder = useCallback(async () => {
    diagCount("msglist:loadOlder:attempt");
    const currentMessages = messagesRef.current;
    if (loadingRef.current || !hasMoreUp || !activeConversationId || currentMessages.length === 0)
      return;
    diagCount("msglist:loadOlder:run");

    loadingRef.current = true;
    setLoadingUp(true);
    try {
      const firstMsg = currentMessages[0];
      const data = await api<{ messages: Message[]; hasMore: boolean }>(
        `/api/conversations/${activeConversationId}/messages?before=${firstMsg.id}&limit=50`
      );

      if (data.messages.length > 0) {
        isPrependingRef.current = true;
        setFirstItemIndex((prev) => prev - data.messages.length);

        const store = useChatStore.getState();
        const current = store.messagesByConversation[activeConversationId] ?? [];
        useChatStore.setState({
          messagesByConversation: {
            ...store.messagesByConversation,
            [activeConversationId]: [...data.messages, ...current],
          },
        });

        requestAnimationFrame(() => {
          isPrependingRef.current = false;
        });
      }

      setHasMoreUp(data.hasMore);
    } catch {
      // ignore
    } finally {
      loadingRef.current = false;
      setLoadingUp(false);
    }
  }, [hasMoreUp, activeConversationId]);

  // Load newer messages (triggered by endReached)
  const loadNewer = useCallback(async () => {
    diagCount("msglist:loadNewer:attempt");
    const currentMessages = messagesRef.current;
    if (loadingRef.current || !hasMoreDown || !activeConversationId || currentMessages.length === 0)
      return;
    diagCount("msglist:loadNewer:run");

    loadingRef.current = true;
    setLoadingDown(true);
    try {
      const lastMsg = currentMessages[currentMessages.length - 1];
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
      loadingRef.current = false;
      setLoadingDown(false);
    }
  }, [hasMoreDown, activeConversationId]);

  // Auto-scroll: follow output only when already at bottom
  const followOutput = useCallback(
    (isAtBottom: boolean): false | "smooth" => (isAtBottom ? "smooth" : false),
    [],
  );

  // Track bottom state for scroll-to-bottom button & new message badge
  const handleAtBottomChange = useCallback((bottom: boolean) => {
    atBottomRef.current = bottom;
    setShowScrollButton(!bottom);
    if (bottom) {
      setNewMessageCount(0);
      // Clear unread divider once user has seen all messages
      if (useChatStore.getState().unreadDividerMessageId) {
        useChatStore.setState({ unreadDividerMessageId: null });
      }
    }
  }, []);

  // Scroll-to-bottom handler — also closes conversation search to prevent conflict
  const handleScrollToBottom = useCallback(() => {
    const state = useChatStore.getState();
    if (state.convSearchOpen) {
      state.closeConvSearch();
    }
    virtuosoRef.current?.scrollToIndex({ index: "LAST", align: "end", behavior: "smooth" });
    setNewMessageCount(0);
  }, []);

  // Initial scroll position (computed once on mount)
  const initialIndex = useMemo(() => {
    if (highlightMessageId) {
      const idx = messages.findIndex((m) => m.id === highlightMessageId);
      if (idx !== -1) return idx;
    }
    return Math.max(0, messages.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When messages first arrive (from IDB cache), scroll to bottom.
  // initialTopMostItemIndex only takes effect at mount time, so if messages
  // were empty when Virtuoso mounted the initial scroll position is wrong.
  const prevLengthRef = useRef(0);
  useEffect(() => {
    if (prevLengthRef.current === 0 && messages.length > 0) {
      virtuosoRef.current?.scrollToIndex({ index: "LAST", align: "end" });
    }
    prevLengthRef.current = messages.length;
  }, [messages.length]);

  // Virtuoso Header / Footer components
  const virtuosoComponents = useMemo(
    () => ({
      Header: () =>
        loadingUp ? (
          <div className="mx-auto flex w-full max-w-3xl justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="pt-2" />
        ),
      Footer: () => (
        <div className="mx-auto w-full max-w-3xl pb-4">
          {loadingDown && (
            <div className="flex justify-center py-2">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {activeConversationId && <TypingIndicator conversationId={activeConversationId} />}
        </div>
      ),
    }),
    [loadingUp, loadingDown, activeConversationId],
  );

  // Item renderer
  // Use conversation search query for highlighting when available, fallback to global search
  const activeHighlightQuery = convSearchQuery || searchQuery;

  const itemContent = useCallback(
    (_index: number, message: Message) => (
      <div
        className={cn(
          "mx-auto w-full max-w-3xl px-4 py-2",
          "transition-colors duration-1000",
          message.id === highlightMessageId && "search-highlight",
        )}
      >
        {/* Unread divider */}
        {message.id === unreadDividerMessageId && (
          <div className="flex items-center gap-3 px-2 pb-2">
            <div className="h-px flex-1 bg-blue-500/60" />
            <span className="shrink-0 text-[11px] font-medium text-blue-500">
              {t("chat.unreadDivider")}
            </span>
            <div className="h-px flex-1 bg-blue-500/60" />
          </div>
        )}
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
            highlightQuery={message.id === highlightMessageId ? activeHighlightQuery : undefined}
            isGroupConversation={isGroupConversation}
          />
        )}
      </div>
    ),
    [highlightMessageId, activeHighlightQuery, agentName, isGroupConversation, unreadDividerMessageId, t],
  );

  if (messages.length === 0 && loadingMessages) {
    return (
      <div className="relative flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto py-4">
          <MessageSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={initialIndex}
        followOutput={followOutput}
        startReached={loadOlder}
        endReached={hasMoreDown ? loadNewer : undefined}
        atBottomStateChange={handleAtBottomChange}
        atBottomThreshold={100}
        increaseViewportBy={{ top: 200, bottom: 200 }}
        components={virtuosoComponents}
        className="h-full"
        itemContent={itemContent}
      />

      {showScrollButton && (
        <button
          onClick={handleScrollToBottom}
          className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 shadow-lg transition-opacity hover:bg-accent"
          aria-label="Scroll to latest"
        >
          {newMessageCount > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">
              {newMessageCount > 99 ? "99+" : newMessageCount}
            </span>
          )}
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
