"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "@/store/chat-store";
import { MessageBubble } from "@/components/chat/message-bubble";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { Button } from "@/components/ui/button";
import { X, Send, Loader2, MessageSquare, Minus, Maximize2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { assetUrl, AGENT_DEFAULT_AVATAR } from "@/lib/config";
import { cn } from "@/lib/utils";

const EMPTY: never[] = [];

interface FloatChatWindowProps {
  agentId: string;
  agentName?: string;
  agentAvatar?: string | null;
  onClose: () => void;
  /** Initial position offset for stacking multiple windows */
  offsetIndex?: number;
  isMobile?: boolean;
}

const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 480;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 320;

/** Bottom nav height + safe area buffer */
const MOBILE_BOTTOM_NAV_HEIGHT = 80;
const MOBILE_BUBBLE_SIZE = 56;
const MOBILE_MIN_HEIGHT = 200;

export function FloatChatWindow({
  agentId,
  agentName,
  agentAvatar,
  onClose,
  offsetIndex = 0,
  isMobile = false,
}: FloatChatWindowProps) {
  const { t } = useTranslation();
  const createConversation = useChatStore((s) => s.createConversation);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const messagesByConversation = useChatStore((s) => s.messagesByConversation);
  const thinkingAgents = useChatStore((s) => s.thinkingAgents);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [initializing, setInitializing] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevActiveRef = useRef<string | null>(null);

  // Dragging state
  const windowRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 60 + offsetIndex * 30, y: 60 + offsetIndex * 30 });
  const [size, setSize] = useState({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; w: number; h: number } | null>(null);

  // Find or create conversation
  useEffect(() => {
    if (!agentId || conversationId) return;
    let cancelled = false;

    const existing = useChatStore.getState().conversations.find(
      (c) => c.agentId === agentId && (c.type === "h2a" || c.type === "direct")
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
  }, [agentId, conversationId, createConversation, setActiveConversation, loadMessages]);

  const handleClose = useCallback(() => {
    if (prevActiveRef.current != null) {
      setActiveConversation(prevActiveRef.current);
    }
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
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }, [lastMsg?.content, lastMsg?.status, messages.length]);

  // Focus textarea
  useEffect(() => {
    if (conversationId && !minimized) {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [conversationId, minimized]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !conversationId) return;
    // Temporarily set active to this conversation for sendMessage
    const prevActive = useChatStore.getState().activeConversationId;
    setActiveConversation(conversationId);
    sendMessage(text);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    // Restore if different
    if (prevActive && prevActive !== conversationId) {
      setActiveConversation(prevActive);
    }
  }, [input, conversationId, sendMessage, setActiveConversation]);

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

  // Track active listeners for cleanup on unmount
  const cleanupRef = useRef<(() => void) | null>(null);

  // ── Drag handlers ─────────────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, posX: pos.x, posY: pos.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPos({
        x: Math.max(0, dragRef.current.posX + dx),
        y: Math.max(0, dragRef.current.posY + dy),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      cleanupRef.current = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    cleanupRef.current = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [pos]);

  // ── Resize handlers ───────────────────────────────────────
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, w: size.w, h: size.h };

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dx = ev.clientX - resizeRef.current.startX;
      const dy = ev.clientY - resizeRef.current.startY;
      setSize({
        w: Math.max(MIN_WIDTH, resizeRef.current.w + dx),
        h: Math.max(MIN_HEIGHT, resizeRef.current.h + dy),
      });
    };
    const onUp = () => {
      resizeRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      cleanupRef.current = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    cleanupRef.current = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [size]);

  // Cleanup drag/resize listeners on unmount
  useEffect(() => {
    return () => { cleanupRef.current?.(); };
  }, []);

  // ── Mobile: touch drag handlers ──────────────────────────
  const touchDragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);

  const onTouchDragStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchDragRef.current = { startX: touch.clientX, startY: touch.clientY, posX: pos.x, posY: pos.y };
  }, [pos]);

  const onTouchDragMove = useCallback((e: React.TouchEvent) => {
    if (!touchDragRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = touch.clientX - touchDragRef.current.startX;
    const dy = touch.clientY - touchDragRef.current.startY;
    const maxX = window.innerWidth - size.w;
    const maxY = window.innerHeight - MOBILE_BOTTOM_NAV_HEIGHT - size.h;
    setPos({
      x: Math.max(0, Math.min(maxX, touchDragRef.current.posX + dx)),
      y: Math.max(0, Math.min(maxY, touchDragRef.current.posY + dy)),
    });
  }, [size]);

  const onTouchDragEnd = useCallback(() => {
    touchDragRef.current = null;
  }, []);

  // ── Mobile: set initial position ───────────────────────
  const mobileInitialized = useRef(false);
  useEffect(() => {
    if (!isMobile || mobileInitialized.current) return;
    mobileInitialized.current = true;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const windowH = Math.round(vh * 0.6);
    setPos({
      x: 8 + offsetIndex * 12,
      y: vh - windowH - MOBILE_BOTTOM_NAV_HEIGHT - 8,
    });
    setSize({ w: vw - 16, h: windowH });
  }, [isMobile, offsetIndex]);

  // ── Mobile: float window ───────────────────────────────
  if (isMobile) {
    // Minimized bubble
    if (minimized) {
      return (
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="fixed z-50 flex items-center gap-2 rounded-full bg-background border border-border shadow-xl px-3"
          style={{
            right: 12 + offsetIndex * (MOBILE_BUBBLE_SIZE + 8),
            bottom: MOBILE_BOTTOM_NAV_HEIGHT + 12,
            height: MOBILE_BUBBLE_SIZE,
          }}
        >
          {agentAvatar ? (
            <img src={assetUrl(agentAvatar)} alt="" className="h-7 w-7 rounded-full object-cover" />
          ) : (
            <div className="h-7 w-7 rounded-full bg-accent flex items-center justify-center text-xs">
              {(agentName ?? "A").charAt(0)}
            </div>
          )}
          <span className="text-xs font-medium truncate max-w-[80px]">{agentName ?? t("nav.chat")}</span>
        </button>
      );
    }

    // Expanded float window
    return (
      <div
        className="fixed z-50 flex flex-col rounded-2xl border border-border bg-background/95 backdrop-blur-sm shadow-2xl overflow-hidden"
        style={{
          left: pos.x,
          top: pos.y,
          width: size.w,
          height: size.h,
          maxHeight: `calc(100vh - ${MOBILE_BOTTOM_NAV_HEIGHT + 16}px)`,
          minHeight: MOBILE_MIN_HEIGHT,
        }}
      >
        {/* Title bar — touch draggable */}
        <div
          className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/50 shrink-0 select-none"
          onTouchStart={onTouchDragStart}
          onTouchMove={onTouchDragMove}
          onTouchEnd={onTouchDragEnd}
          onMouseDown={onDragStart}
        >
          {/* Drag handle indicator */}
          <div className="absolute left-1/2 top-1.5 -translate-x-1/2 w-8 h-1 rounded-full bg-muted-foreground/30" />
          {agentAvatar ? (
            <img src={assetUrl(agentAvatar)} alt="" className="h-6 w-6 rounded-full object-cover pointer-events-none" />
          ) : (
            <div className="h-6 w-6 rounded-full bg-accent flex items-center justify-center text-xs pointer-events-none">
              {(agentName ?? "A").charAt(0)}
            </div>
          )}
          <span className="text-sm font-medium truncate flex-1 pointer-events-none">
            {agentName ?? t("nav.chat")}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-xs" className="h-7 w-7" onClick={() => setMinimized(true)}>
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" className="h-7 w-7" onClick={handleClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto py-2 min-h-0">
          {initializing ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <MessageSquare className="h-7 w-7 mb-2 opacity-50" />
              <p className="text-sm">{t("officeChat.startConversation")}</p>
            </div>
          ) : (
            <div className="space-y-1 px-3">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} isInThread />
              ))}
            </div>
          )}
          {conversationId && thinking.length > 0 && (
            <div className="px-3 mt-1">
              <TypingIndicator conversationId={conversationId} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t px-3 py-2.5">
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
            <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSend} disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Desktop: floating window ──────────────────────────────
  return (
    <div
      ref={windowRef}
      className="fixed z-50 flex flex-col rounded-xl border border-border bg-background shadow-2xl overflow-hidden"
      style={{
        left: pos.x,
        top: pos.y,
        width: minimized ? DEFAULT_WIDTH : size.w,
        height: minimized ? 44 : size.h,
        transition: minimized ? "height 0.2s ease" : undefined,
      }}
    >
      {/* Title bar — draggable */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/50 cursor-move shrink-0 select-none"
        onMouseDown={onDragStart}
      >
        {agentAvatar ? (
          <img src={assetUrl(agentAvatar)} alt="" className="h-5 w-5 rounded-full object-cover pointer-events-none" />
        ) : (
          <div className="h-5 w-5 rounded-full bg-accent flex items-center justify-center text-[10px] pointer-events-none">
            {(agentName ?? "A").charAt(0)}
          </div>
        )}
        <span className="text-xs font-medium truncate flex-1 pointer-events-none">
          {agentName ?? t("nav.chat")}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost" size="icon-xs" className="h-5 w-5"
            onClick={() => setMinimized(!minimized)}
          >
            {minimized ? <Maximize2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon-xs" className="h-5 w-5" onClick={handleClose}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto py-2 min-h-0">
            {initializing ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <MessageSquare className="h-6 w-6 mb-2 opacity-50" />
                <p className="text-xs">{t("officeChat.startConversation")}</p>
              </div>
            ) : (
              <div className="space-y-1 px-2">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} isInThread />
                ))}
              </div>
            )}
            {conversationId && thinking.length > 0 && (
              <div className="px-2 mt-1">
                <TypingIndicator conversationId={conversationId} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 border-t px-2 py-2">
            <div className="flex items-end gap-1.5">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder={t("officeChat.placeholder")}
                rows={1}
                className="flex-1 resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleSend} disabled={!input.trim()}>
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Resize handle (bottom-right corner) */}
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
            onMouseDown={onResizeStart}
          >
            <svg viewBox="0 0 16 16" className="w-full h-full text-muted-foreground/40">
              <path d="M14 14L8 14L14 8Z" fill="currentColor" />
            </svg>
          </div>
        </>
      )}
    </div>
  );
}
