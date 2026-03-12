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
  Share2,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🤔", "👀"];
const INTERACTION_GUARD_MS = 300;
const MENU_W = 200;
const VIEWPORT_PAD = 8;
const GAP = 8;

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
  onShare?: () => void;
  isInThread?: boolean;
  onSelect?: () => void;
}

interface Layout {
  /** Cloned message position */
  cloneTop: number;
  cloneLeft: number;
  cloneWidth: number;
  cloneHeight: number;
  /** Emoji row position */
  emojiTop: number;
  emojiLeft: number;
  /** Menu position */
  menuTop: number;
  menuLeft: number;
  menuMaxH: number;
  /** Clone HTML */
  cloneHtml: string;
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
  onShare,
  isInThread,
  onSelect,
}: MessageContextMenuProps) {
  const { t } = useTranslation();
  const [layout, setLayout] = useState<Layout | null>(null);
  const [visible, setVisible] = useState(false);
  const openedAtRef = useRef(0);
  const prevOpenRef = useRef(false);
  const emojiRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const savedOverflowRef = useRef("");
  const ignoreNextClickRef = useRef(false);

  // Track open timestamp for guard + mark first click to ignore
  if (open && !prevOpenRef.current) {
    openedAtRef.current = Date.now();
    ignoreNextClickRef.current = true;
  }
  prevOpenRef.current = open;

  // Compute layout: clone message HTML, center it, position emoji + menu around it
  useLayoutEffect(() => {
    if (!open || !message) {
      setLayout(null);
      return;
    }

    const el = document.querySelector(`[data-message-id="${message.id}"]`) as HTMLElement | null;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const vp = window.visualViewport;
    const vpTop = vp?.offsetTop ?? 0;
    const vh = vp?.height ?? window.innerHeight;
    const vw = vp?.width ?? window.innerWidth;
    const safeTop = vpTop || parseSafeAreaTop();
    const padTop = Math.max(VIEWPORT_PAD, safeTop + 8);

    const cloneHtml = el.outerHTML;
    const cloneW = rect.width;
    const cloneH = rect.height;

    const emojiH = emojiRef.current?.offsetHeight ?? 52;
    const menuH = menuRef.current?.scrollHeight ?? 320;

    // Center clone vertically in viewport
    const totalNeeded = emojiH + GAP + cloneH + GAP + menuH;
    let cloneTop: number;

    if (totalNeeded + padTop + VIEWPORT_PAD <= vh) {
      // Everything fits: center the whole group
      const groupTop = vpTop + Math.max(padTop, (vh - totalNeeded) / 2);
      cloneTop = groupTop + emojiH + GAP;
    } else {
      // Tight: put clone in center, let menu scroll
      cloneTop = vpTop + Math.max(padTop + emojiH + GAP, (vh - cloneH) / 2);
    }

    const cloneLeft = rect.left;

    // Emoji above clone
    const emojiTop = cloneTop - GAP - emojiH;

    // Menu below clone — clamp so it never goes off-screen (may overlap clone, like Telegram)
    const idealMenuTop = cloneTop + cloneH + GAP;
    const menuTop = Math.min(idealMenuTop, vpTop + vh - menuH - VIEWPORT_PAD);
    const availableForMenu = vpTop + vh - menuTop - VIEWPORT_PAD;
    const menuMaxH = Math.min(menuH, Math.max(availableForMenu, 120));

    // Horizontal positioning for emoji + menu (same logic as before)
    let menuLeft = rect.left;
    if (menuLeft + MENU_W > vw - 12) menuLeft = vw - MENU_W - 12;
    if (menuLeft < 12) menuLeft = 12;

    setLayout({
      cloneTop, cloneLeft, cloneWidth: cloneW, cloneHeight: cloneH,
      emojiTop, emojiLeft: menuLeft,
      menuTop, menuLeft, menuMaxH,
      cloneHtml,
    });
  }, [open, message?.id]);

  // Entrance animation + scroll lock
  useEffect(() => {
    if (!open || !message) {
      setVisible(false);
      document.body.style.overflow = savedOverflowRef.current;
      return;
    }

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

  const showContent = visible && layout;

  const cloneStyle: React.CSSProperties = layout
    ? {
        position: "fixed",
        top: layout.cloneTop,
        left: layout.cloneLeft,
        width: layout.cloneWidth,
      }
    : { position: "fixed", top: -9999, left: -9999, visibility: "hidden" };

  const glowStyle: React.CSSProperties | undefined = layout
    ? {
        position: "fixed",
        top: layout.cloneTop - 4,
        left: layout.cloneLeft - 4,
        width: layout.cloneWidth + 8,
        height: layout.cloneHeight + 8,
        borderRadius: "1.25rem",
        boxShadow: isOwn
          ? "0 0 24px 6px rgba(59, 130, 246, 0.4)"
          : "0 0 24px 6px rgba(148, 163, 184, 0.3)",
        pointerEvents: "none",
      }
    : undefined;

  const emojiStyle: React.CSSProperties = layout
    ? { position: "fixed", top: layout.emojiTop, left: layout.emojiLeft }
    : { position: "fixed", top: -9999, left: -9999, visibility: "hidden" };

  const menuStyle: React.CSSProperties = layout
    ? { position: "fixed", top: layout.menuTop, left: layout.menuLeft, maxHeight: layout.menuMaxH }
    : { position: "fixed", top: -9999, left: -9999, visibility: "hidden" };

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] transition-opacity duration-150 ${visible ? "opacity-100" : "opacity-0"}`}
      style={{ touchAction: "manipulation", pointerEvents: "auto" }}
      onTouchEnd={(e) => {
        // Block synthetic click from touchend during guard period
        if (Date.now() - openedAtRef.current < INTERACTION_GUARD_MS) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onClick={() => {
        // Ignore the very first click (iOS 300ms delayed synthetic click from long-press release)
        if (ignoreNextClickRef.current) {
          ignoreNextClickRef.current = false;
          return;
        }
        if (Date.now() - openedAtRef.current < INTERACTION_GUARD_MS) return;
        close();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Glow around cloned message */}
      {glowStyle && (
        <div
          className={`z-[102] transition-opacity duration-150 ${showContent ? "opacity-100" : "opacity-0"}`}
          style={glowStyle}
        />
      )}

      {/* Cloned message — centered in viewport, above backdrop */}
      <div
        className={`z-[102] pointer-events-none transition-all duration-150 ${showContent ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
        style={cloneStyle}
        dangerouslySetInnerHTML={layout ? { __html: layout.cloneHtml } : undefined}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Quick emoji row */}
      <div
        ref={emojiRef}
        className={`z-[103] flex items-center gap-1 rounded-full border border-border/50 bg-card/95 px-2 py-1.5 shadow-xl transition-all duration-150 ${showContent ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
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
        className={`z-[103] w-[200px] rounded-2xl border border-border/50 bg-card/95 shadow-xl backdrop-blur-md overflow-hidden overflow-y-auto transition-all duration-150 ${showContent ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
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
          {onShare && (
            <MenuButton
              icon={<Share2 className="h-[18px] w-[18px]" />}
              label={t("chat.actions.share")}
              onClick={() => handle(onShare)}
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
