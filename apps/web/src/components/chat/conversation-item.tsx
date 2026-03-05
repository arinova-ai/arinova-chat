"use client";

import { useState, useRef, useEffect, useCallback, useSyncExternalStore } from "react";
import type { Message } from "@arinova/shared/types";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Bot, Pin, PinOff, MoreVertical, Pencil, Trash2, Users, BellOff, Bell } from "lucide-react";
import type { ConversationType } from "@arinova/shared/types";
import { assetUrl, AGENT_DEFAULT_AVATAR } from "@/lib/config";
import { useTranslation } from "@/lib/i18n";
import { VerifiedBadge } from "@/components/ui/verified-badge";

// Detect hover-capable device (desktop) vs touch-only (mobile)
const hoverQuery = typeof window !== "undefined" ? window.matchMedia("(hover: hover)") : null;
function subscribeHover(cb: () => void) {
  hoverQuery?.addEventListener("change", cb);
  return () => hoverQuery?.removeEventListener("change", cb);
}
function getHoverSnapshot() { return hoverQuery?.matches ?? false; }
function getHoverServerSnapshot() { return false; }

const SWIPE_THRESHOLD = 70;
const SWIPE_ACTION_WIDTH = 140;
const SWIPE_DELETE_WIDTH = 80;

interface ConversationItemProps {
  id: string;
  title: string | null;
  agentName: string;
  agentDescription?: string | null;
  agentAvatarUrl?: string | null;
  type?: ConversationType;
  lastMessage: Message | null;
  pinnedAt: Date | null;
  updatedAt: Date;
  isActive: boolean;
  onClick: () => void;
  onRename: (title: string) => void;
  onPin: (pinned: boolean) => void;
  onMuteToggle?: () => void;
  isMuted?: boolean;
  unreadCount?: number;
  isOnline?: boolean;
  isThinking?: boolean;
  isVerified?: boolean;
  onDelete: () => void;
}

function formatTime(date: Date, t: (key: string) => string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (days === 1) return t("time.yesterday");
  if (days < 7) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

export function ConversationItem({
  id,
  title,
  agentName,
  agentDescription,
  agentAvatarUrl,
  type = "direct",
  lastMessage,
  pinnedAt,
  updatedAt,
  isActive,
  onClick,
  unreadCount = 0,
  isOnline = false,
  isThinking = false,
  isVerified = false,
  onRename,
  onPin,
  onMuteToggle,
  isMuted = false,
  onDelete,
}: ConversationItemProps) {
  const { t } = useTranslation();
  const isDesktop = useSyncExternalStore(subscribeHover, getHoverSnapshot, getHoverServerSnapshot);
  const preview = (() => {
    if (!lastMessage) return t("chat.noMessages");
    if (lastMessage.role === "system") {
      return `ℹ️ ${truncate(lastMessage.content.replace(/\n/g, " "), 50)}`;
    }
    const audioAtt = lastMessage.attachments?.find((a) =>
      a.fileType.startsWith("audio/")
    );
    if (audioAtt) {
      const dur = audioAtt.duration ?? 0;
      const m = Math.floor(dur / 60);
      const s = dur % 60;
      const ts = `${m}:${String(s).padStart(2, "0")}`;
      return `🎙 ${t("chat.voiceMessage")} (${ts})`;
    }
    const imageAtt = lastMessage.attachments?.find((a) =>
      a.fileType.startsWith("image/")
    );
    if (imageAtt) {
      return `📷 ${t("chat.photoMessage")}`;
    }
    const fileAtt = lastMessage.attachments?.find((a) =>
      !a.fileType.startsWith("audio/") && !a.fileType.startsWith("image/")
    );
    if (fileAtt) {
      return `📎 ${fileAtt.fileName}`;
    }
    return truncate(lastMessage.content.replace(/\n/g, " "), 50);
  })();

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(title ?? agentName);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Swipe state
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const swipingRef = useRef(false);
  const startOffsetRef = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    startOffsetRef.current = swipeOffset;
    swipingRef.current = false;
  }, [swipeOffset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    // If vertical movement is larger, don't swipe (allow scroll)
    if (!swipingRef.current && Math.abs(dy) > Math.abs(dx)) {
      touchStartRef.current = null;
      return;
    }

    if (Math.abs(dx) > 10) {
      swipingRef.current = true;
    }

    if (swipingRef.current) {
      const raw = startOffsetRef.current + dx;
      let clamped: number;
      if (startOffsetRef.current > 0) {
        // Right side (Pin/Mute) was open — only allow closing toward 0, don't open Delete
        clamped = Math.max(0, Math.min(SWIPE_ACTION_WIDTH, raw));
      } else if (startOffsetRef.current < 0) {
        // Left side (Delete) was open — only allow closing toward 0, don't open Pin/Mute
        clamped = Math.max(-SWIPE_DELETE_WIDTH, Math.min(0, raw));
      } else {
        // Nothing open — allow either direction
        clamped = Math.max(-SWIPE_DELETE_WIDTH, Math.min(SWIPE_ACTION_WIDTH, raw));
      }
      setSwipeOffset(clamped);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!swipingRef.current) {
      touchStartRef.current = null;
      return;
    }
    // Snap open or closed
    if (swipeOffset > SWIPE_THRESHOLD) {
      setSwipeOffset(SWIPE_ACTION_WIDTH);
    } else if (swipeOffset < -SWIPE_THRESHOLD) {
      setSwipeOffset(-SWIPE_DELETE_WIDTH);
    } else {
      setSwipeOffset(0);
    }
    touchStartRef.current = null;
    swipingRef.current = false;
  }, [swipeOffset]);

  const resetSwipe = useCallback(() => setSwipeOffset(0), []);

  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  const handleRenameSubmit = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== (title ?? agentName)) {
      onRename(trimmed);
    }
    setRenaming(false);
  }, [renameValue, title, agentName, onRename]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleRenameSubmit();
      } else if (e.key === "Escape") {
        setRenaming(false);
        setRenameValue(title ?? agentName);
      }
    },
    [handleRenameSubmit, title, agentName]
  );

  const handleConfirmDelete = useCallback(() => {
    onDelete();
    setDeleteConfirmOpen(false);
  }, [onDelete]);

  const isPinned = pinnedAt !== null;

  const cardContent = (
      <div className="relative overflow-hidden rounded-lg">
        {/* Left actions (right swipe): Pin + Mute — mobile only */}
        <div
          className="absolute inset-y-0 left-0 flex items-stretch md:hidden"
          style={{ width: SWIPE_ACTION_WIDTH }}
        >
          <button
            type="button"
            className="flex flex-1 flex-col items-center justify-center gap-0.5 bg-yellow-500 text-white"
            onClick={() => {
              onPin(!isPinned);
              resetSwipe();
            }}
          >
            {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            <span className="text-[10px] font-medium">{isPinned ? t("conversation.unpin") : t("conversation.pin")}</span>
          </button>
          {onMuteToggle && (
            <button
              type="button"
              className="flex flex-1 flex-col items-center justify-center gap-0.5 bg-blue-500 text-white"
              onClick={() => {
                onMuteToggle();
                resetSwipe();
              }}
            >
              {isMuted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              <span className="text-[10px] font-medium">{isMuted ? t("chat.header.unmuteConversation") : t("chat.header.muteConversation")}</span>
            </button>
          )}
        </div>

        {/* Right action (left swipe): Delete — mobile only */}
        <div
          className="absolute inset-y-0 right-0 flex items-stretch md:hidden"
          style={{ width: SWIPE_DELETE_WIDTH }}
        >
          <button
            type="button"
            className="flex flex-1 flex-col items-center justify-center gap-0.5 bg-red-500 text-white"
            onClick={() => {
              resetSwipe();
              setDeleteConfirmOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
            <span className="text-[10px] font-medium">{t("common.delete")}</span>
          </button>
        </div>

        {/* Swipeable content */}
        <div
          className={cn(
            "group relative flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left bg-card",
            swipeOffset === 0 && "transition-transform duration-200",
            swipeOffset !== 0 && !swipingRef.current && "transition-transform duration-200",
            isActive
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50 text-foreground"
          )}
          style={{ transform: `translateX(${swipeOffset}px)` }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
        <button
          onClick={onClick}
          className="flex flex-1 min-w-0 items-center gap-3 text-left"
        >
          <div className="relative shrink-0">
            <Avatar className="h-10 w-10">
              {type === "direct" && (
                <AvatarImage
                  src={agentAvatarUrl ? assetUrl(agentAvatarUrl) : AGENT_DEFAULT_AVATAR}
                  alt={agentName}
                  className="object-cover"
                />
              )}
              <AvatarFallback className="bg-accent text-foreground/80 text-xs">
                {type === "group" ? (
                  <Users className="h-5 w-5" />
                ) : (
                  <Bot className="h-5 w-5" />
                )}
              </AvatarFallback>
            </Avatar>
            {isOnline && (
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-green-500" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 truncate text-sm font-medium">
                {isPinned && (
                  <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                {renaming ? null : (title ?? agentName)}
                {!renaming && isVerified && <VerifiedBadge className="h-3.5 w-3.5 text-blue-500" />}
                {!renaming && agentDescription && (
                  <span className="text-xs text-muted-foreground ml-1 truncate">{agentDescription}</span>
                )}
              </span>
              {!renaming && (
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {formatTime(updatedAt, t)}
                  </span>
                  {unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </span>
              )}
            </div>
            {renaming ? (
              <Input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={handleRenameKeyDown}
                className="mt-0.5 h-6 bg-secondary border-none text-xs px-1.5"
              />
            ) : (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {isThinking ? (
                  <span className="text-blue-400">{t("chat.thinking")}</span>
                ) : (
                  preview
                )}
              </p>
            )}
          </div>
        </button>

        {/* Three-dot menu button — mobile only */}
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn(
                "shrink-0 text-muted-foreground transition-opacity md:hidden",
                menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setRenaming(true);
                setRenameValue(title ?? agentName);
              }}
            >
              <Pencil className="h-4 w-4" />
              {t("conversation.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onPin(!isPinned);
              }}
            >
              {isPinned ? (
                <>
                  <PinOff className="h-4 w-4" />
                  {t("conversation.unpin")}
                </>
              ) : (
                <>
                  <Pin className="h-4 w-4" />
                  {t("conversation.pin")}
                </>
              )}
            </DropdownMenuItem>
            {onMuteToggle && (
              <>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onMuteToggle();
                  }}
                >
                  {isMuted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                  {isMuted ? t("chat.header.unmuteConversation") : t("chat.header.muteConversation")}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteConfirmOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              {t("common.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </div>
  );

  return (
    <>
      {isDesktop ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            {cardContent}
          </ContextMenuTrigger>
          <ContextMenuContent className="w-44">
            <ContextMenuItem
              onClick={() => {
                setRenaming(true);
                setRenameValue(title ?? agentName);
              }}
            >
              <Pencil className="h-4 w-4" />
              {t("conversation.rename")}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onPin(!isPinned)}>
              {isPinned ? (
                <>
                  <PinOff className="h-4 w-4" />
                  {t("conversation.unpin")}
                </>
              ) : (
                <>
                  <Pin className="h-4 w-4" />
                  {t("conversation.pin")}
                </>
              )}
            </ContextMenuItem>
            {onMuteToggle && (
              <ContextMenuItem onClick={() => onMuteToggle()}>
                {isMuted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                {isMuted ? t("chat.header.unmuteConversation") : t("chat.header.muteConversation")}
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              {t("common.delete")}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        cardContent
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("conversation.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("conversation.deleteDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
