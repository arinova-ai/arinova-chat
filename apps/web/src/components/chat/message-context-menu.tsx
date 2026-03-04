"use client";

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import type { Message } from "@arinova/shared/types";
import {
  Copy,
  Trash2,
  RotateCcw,
  Reply,
  Pin,
  PinOff,
  MessageSquare,
  Flag,
  CheckSquare,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🤔", "👀"];
const INTERACTION_GUARD_MS = 300;
const MENU_W = 200;
const VIEWPORT_PAD = 8;

/** Parse CSS env(safe-area-inset-top) for iOS notch/status bar. */
function parseSafeAreaTop(): number {
  if (typeof document === "undefined") return 0;
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top,0px);pointer-events:none;visibility:hidden";
  document.body.appendChild(div);
  const h = div.offsetHeight;
  document.body.removeChild(div);
  return h;
}

interface MessageContextMenuProps {
  message: Message | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwnMessage: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onRetry: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onPin?: () => void;
  isPinned?: boolean;
  onStartThread?: () => void;
  onReport?: () => void;
  isInThread?: boolean;
  onSelect?: () => void;
}

interface MenuPosition {
  emojiTop: number;
  menuTop: number;
  left: number;
  menuMaxH: number;
  msgRect: DOMRect;
}

export function MessageContextMenu({
  message,
  open,
  onOpenChange,
  isOwnMessage: isOwn,
  onCopy,
  onDelete,
  onRetry,
  onReply,
  onReact,
  onPin,
  isPinned,
  onStartThread,
  onReport,
  isInThread,
  onSelect,
}: MessageContextMenuProps) {
  const { t } = useTranslation();
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [visible, setVisible] = useState(false);
  const openedAtRef = useRef(0);
  const prevOpenRef = useRef(false);
  const emojiRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const savedOverflowRef = useRef("");
  const elevatedElsRef = useRef<{ el: HTMLElement; prev: string }[]>([]);

  // Track open timestamp for guard
  if (open && !prevOpenRef.current) {
    openedAtRef.current = Date.now();
  }
  prevOpenRef.current = open;

  // Compute position after DOM renders (measures actual element sizes)
  useLayoutEffect(() => {
    if (!open || !message) {
      setPosition(null);
      return;
    }

    const el = document.querySelector(`[data-message-id="${message.id}"]`);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    // Use visualViewport for accurate dimensions on iOS (accounts for browser chrome)
    const vp = window.visualViewport;
    const vpTop = vp?.offsetTop ?? 0;
    const vh = vp?.height ?? window.innerHeight;
    const vw = vp?.width ?? window.innerWidth;

    // iOS safe area: prevent content from going under the notch/status bar
    const safeTop = vpTop || parseSafeAreaTop();
    const padTop = Math.max(VIEWPORT_PAD, safeTop + 8);

    const emojiH = emojiRef.current?.offsetHeight ?? 52;
    const menuH = menuRef.current?.scrollHeight ?? 320;
    const gap = 8;
    const totalH = emojiH + gap + menuH;

    const spaceBelow = (vpTop + vh) - rect.bottom;
    const spaceAbove = rect.top - vpTop;
    const placeAbove = spaceBelow < totalH + VIEWPORT_PAD && spaceAbove > spaceBelow;

    let emojiTop: number;
    if (placeAbove) {
      emojiTop = Math.max(padTop, rect.top - totalH - 4);
    } else {
      emojiTop = Math.min(vpTop + vh - totalH - VIEWPORT_PAD, rect.bottom + 4);
    }
    // Clamp: never go above safe area
    emojiTop = Math.max(padTop, emojiTop);
    const menuTop = emojiTop + emojiH + gap;

    // Constrain menu height if viewport is very small
    const availableForMenu = vpTop + vh - menuTop - VIEWPORT_PAD;
    const menuMaxH = Math.min(menuH, Math.max(availableForMenu, 120));

    let left = rect.left;
    if (left + MENU_W > vw - 12) left = vw - MENU_W - 12;
    if (left < 12) left = 12;

    setPosition({ emojiTop, menuTop, left, menuMaxH, msgRect: rect });
  }, [open, message?.id]);

  // Elevate the original message element above the backdrop so it's visible
  // (Telegram-style: message floats above the dimmed overlay)
  useEffect(() => {
    if (!open || !message) return;

    const el = document.querySelector(`[data-message-id="${message.id}"]`) as HTMLElement | null;
    if (!el) return;

    const toElevate: { el: HTMLElement; prev: string }[] = [];

    // Elevate the message element itself
    toElevate.push({ el, prev: el.style.zIndex });
    el.style.zIndex = "200";
    el.style.position = "relative";

    // Elevate scroll container (Virtuoso creates nested divs with overflow)
    // Walk up to find the scrollable ancestor so the message can escape its stacking context
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      const style = getComputedStyle(parent);
      if (style.overflow === "auto" || style.overflow === "scroll" ||
          style.overflowY === "auto" || style.overflowY === "scroll") {
        toElevate.push({ el: parent, prev: parent.style.zIndex });
        parent.style.zIndex = "200";
        break;
      }
      parent = parent.parentElement;
    }

    elevatedElsRef.current = toElevate;

    return () => {
      for (const { el: e, prev } of elevatedElsRef.current) {
        e.style.zIndex = prev;
        if (e.style.position === "relative" && !prev) {
          e.style.position = "";
        }
      }
      elevatedElsRef.current = [];
    };
  }, [open, message]);

  // Entrance animation + scroll lock
  useEffect(() => {
    if (!open || !message) {
      setVisible(false);
      document.body.style.overflow = savedOverflowRef.current;
      return;
    }

    // Save current overflow before locking
    savedOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => setVisible(true));

    return () => {
      document.body.style.overflow = savedOverflowRef.current;
    };
  }, [open, message]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const close = useCallback(() => {
    setVisible(false);
    setTimeout(() => onOpenChange(false), 150);
  }, [onOpenChange]);

  if (!open || !message) return null;

  const isError = message.status === "error";

  const handle = (action: () => void) => {
    if (Date.now() - openedAtRef.current < INTERACTION_GUARD_MS) return;
    action();
    close();
  };

  // Glow effect on the original message element
  // Rendered after backdrop in DOM order + z-[102] to sit above backdrop-blur
  // (iOS Safari's backdrop-filter creates a new stacking context)
  const glowStyle = position?.msgRect
    ? {
        position: "fixed" as const,
        top: position.msgRect.top,
        left: position.msgRect.left,
        width: position.msgRect.width,
        height: position.msgRect.height,
        borderRadius: "1rem",
        boxShadow: isOwn
          ? "0 0 20px 4px rgba(59, 130, 246, 0.4)"
          : "0 0 20px 4px rgba(148, 163, 184, 0.3)",
        pointerEvents: "none" as const,
      }
    : undefined;

  const emojiStyle: React.CSSProperties = position
    ? { position: "fixed", top: position.emojiTop, left: position.left }
    : { position: "fixed", top: -9999, left: -9999, visibility: "hidden" as const };

  const menuStyle: React.CSSProperties = position
    ? { position: "fixed", top: position.menuTop, left: position.left, maxHeight: position.menuMaxH }
    : { position: "fixed", top: -9999, left: -9999, visibility: "hidden" as const };

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] transition-opacity duration-150 ${visible ? "opacity-100" : "opacity-0"}`}
      onClick={close}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Message glow highlight — z-[102] above backdrop-blur stacking context */}
      {glowStyle && <div className="z-[102]" style={glowStyle} />}

      {/* Quick emoji row */}
      <div
        ref={emojiRef}
        className={`flex items-center gap-1 rounded-full border border-border/50 bg-card/95 px-2 py-1.5 shadow-xl transition-all duration-150 ${visible && position ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
        style={emojiStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => handle(() => onReact(emoji))}
            className="rounded-full p-1.5 text-xl active:scale-110 active:bg-accent transition-transform"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Context menu */}
      <div
        ref={menuRef}
        className={`w-[200px] rounded-2xl border border-border/50 bg-card/95 shadow-xl backdrop-blur-md overflow-hidden overflow-y-auto transition-all duration-150 ${visible && position ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
        style={menuStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="py-1">
          <MenuButton
            icon={<Copy className="h-[18px] w-[18px]" />}
            label={t("common.copy")}
            onClick={() => handle(onCopy)}
          />
          {onSelect && (
            <MenuButton
              icon={<CheckSquare className="h-[18px] w-[18px]" />}
              label={t("chat.actions.select")}
              onClick={() => handle(onSelect)}
            />
          )}
          <MenuButton
            icon={<Reply className="h-[18px] w-[18px]" />}
            label={t("chat.actions.reply")}
            onClick={() => handle(onReply)}
          />
          {!isInThread && onStartThread && (
            <MenuButton
              icon={<MessageSquare className="h-[18px] w-[18px]" />}
              label={t("chat.actions.startThread")}
              onClick={() => handle(onStartThread)}
            />
          )}
          {onPin && (
            <MenuButton
              icon={isPinned ? <PinOff className="h-[18px] w-[18px]" /> : <Pin className="h-[18px] w-[18px]" />}
              label={isPinned ? t("chat.actions.unpin") : t("chat.actions.pin")}
              onClick={() => handle(onPin)}
            />
          )}
          {onReport && (
            <MenuButton
              icon={<Flag className="h-[18px] w-[18px]" />}
              label={t("chat.actions.report")}
              onClick={() => handle(onReport)}
            />
          )}
          {isError && (
            <MenuButton
              icon={<RotateCcw className="h-[18px] w-[18px]" />}
              label={t("common.retry")}
              onClick={() => handle(onRetry)}
            />
          )}
          <MenuButton
            icon={<Trash2 className="h-[18px] w-[18px]" />}
            label={t("common.delete")}
            onClick={() => handle(onDelete)}
            destructive
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function MenuButton({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors active:bg-accent/50 ${
        destructive
          ? "text-red-400"
          : "text-foreground"
      }`}
    >
      <span className={destructive ? "text-red-400" : "text-muted-foreground"}>
        {icon}
      </span>
      {label}
    </button>
  );
}
