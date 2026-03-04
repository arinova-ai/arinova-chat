"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
  top: number;
  left: number;
  menuAbove: boolean;
  msgRect: DOMRect;
}

function computePosition(messageId: string): MenuPosition | null {
  const el = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!el) return null;

  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Menu dimensions estimate (w: 200, h: ~320 including emoji row)
  const menuW = 200;
  const menuH = 320;
  const emojiH = 52;
  const totalH = menuH + emojiH + 8; // menu + emoji + gap

  // Determine if menu goes above or below the message
  const spaceBelow = vh - rect.bottom;
  const spaceAbove = rect.top;
  const menuAbove = spaceBelow < totalH && spaceAbove > spaceBelow;

  const top = menuAbove
    ? Math.max(8, rect.top - totalH - 4)
    : Math.min(vh - totalH - 8, rect.bottom + 4);

  // Horizontal: align to message side
  let left = rect.left;
  if (left + menuW > vw - 12) left = vw - menuW - 12;
  if (left < 12) left = 12;

  return { top, left, menuAbove, msgRect: rect };
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

  // Track open timestamp for guard
  if (open && !prevOpenRef.current) {
    openedAtRef.current = Date.now();
  }
  prevOpenRef.current = open;

  // Compute position + scroll lock on open
  useEffect(() => {
    if (!open || !message) {
      setVisible(false);
      setPosition(null);
      document.body.style.overflow = "";
      return;
    }

    const pos = computePosition(message.id);
    setPosition(pos);

    // Trigger entrance animation
    requestAnimationFrame(() => setVisible(true));

    // Scroll lock
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
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
    // Wait for exit animation
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
  const glowStyle = position?.msgRect
    ? {
        position: "fixed" as const,
        top: position.msgRect.top,
        left: position.msgRect.left,
        width: position.msgRect.width,
        height: position.msgRect.height,
        zIndex: 101,
        borderRadius: "1rem",
        boxShadow: isOwn
          ? "0 0 20px 4px rgba(59, 130, 246, 0.4)"
          : "0 0 20px 4px rgba(148, 163, 184, 0.3)",
        pointerEvents: "none" as const,
      }
    : undefined;

  const menuStyle: React.CSSProperties | undefined = position
    ? {
        position: "fixed",
        top: position.menuAbove ? undefined : position.top + 52 + 8,
        bottom: position.menuAbove
          ? window.innerHeight - position.top - 52 - 8
          : undefined,
        left: position.left,
      }
    : undefined;

  const emojiStyle: React.CSSProperties | undefined = position
    ? {
        position: "fixed",
        top: position.top,
        left: position.left,
      }
    : undefined;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] transition-opacity duration-150 ${visible ? "opacity-100" : "opacity-0"}`}
      onClick={close}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Message glow highlight */}
      {glowStyle && <div style={glowStyle} />}

      {/* Quick emoji row */}
      {emojiStyle && (
        <div
          className={`flex items-center gap-1 rounded-full border border-border/50 bg-card/95 px-2 py-1.5 shadow-xl transition-all duration-150 ${visible ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
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
      )}

      {/* Context menu */}
      {menuStyle && (
        <div
          className={`w-[200px] rounded-2xl border border-border/50 bg-card/95 shadow-xl backdrop-blur-md overflow-hidden transition-all duration-150 ${visible ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
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
                label={isPinned ? "Unpin" : "Pin"}
                onClick={() => handle(onPin)}
              />
            )}
            {onReport && (
              <MenuButton
                icon={<Flag className="h-[18px] w-[18px]" />}
                label="Report"
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
      )}
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
