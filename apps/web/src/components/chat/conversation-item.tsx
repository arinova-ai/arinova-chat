"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Bot, Pin, PinOff, MoreVertical, Pencil, Trash2, Users } from "lucide-react";
import type { ConversationType } from "@arinova/shared/types";
import { BACKEND_URL } from "@/lib/config";

interface ConversationItemProps {
  id: string;
  title: string | null;
  agentName: string;
  agentAvatarUrl?: string | null;
  type?: ConversationType;
  lastMessage: Message | null;
  pinnedAt: Date | null;
  updatedAt: Date;
  isActive: boolean;
  onClick: () => void;
  onRename: (title: string) => void;
  onPin: (pinned: boolean) => void;
  unreadCount?: number;
  onDelete: () => void;
}

function formatTime(date: Date): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (days === 1) return "Yesterday";
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
  agentAvatarUrl,
  type = "direct",
  lastMessage,
  pinnedAt,
  updatedAt,
  isActive,
  onClick,
  unreadCount = 0,
  onRename,
  onPin,
  onDelete,
}: ConversationItemProps) {
  const preview = lastMessage
    ? truncate(lastMessage.content.replace(/\n/g, " "), 50)
    : "No messages yet";

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(title ?? agentName);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <>
      <div
        className={cn(
          "group relative flex w-full items-center gap-3 overflow-hidden rounded-lg px-3 py-3 text-left transition-colors",
          isActive
            ? "bg-accent text-accent-foreground"
            : "hover:bg-accent/50 text-foreground"
        )}
      >
        <button
          onClick={onClick}
          className="flex flex-1 min-w-0 items-center gap-3 text-left"
        >
          <Avatar className="h-10 w-10 shrink-0">
            {agentAvatarUrl && type === "direct" && (
              <AvatarImage
                src={`${BACKEND_URL}${agentAvatarUrl}`}
                alt={agentName}
                className="object-cover"
              />
            )}
            <AvatarFallback className="bg-neutral-700 text-neutral-200 text-xs">
              {type === "group" ? (
                <Users className="h-5 w-5" />
              ) : (
                <Bot className="h-5 w-5" />
              )}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 truncate text-sm font-medium">
                {isPinned && (
                  <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                {renaming ? null : (title ?? agentName)}
              </span>
              {!renaming && (
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {formatTime(updatedAt)}
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
                className="mt-0.5 h-6 bg-neutral-800 border-none text-xs px-1.5"
              />
            ) : (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {lastMessage?.status === "streaming" ? (
                  <span className="text-blue-400">Typing...</span>
                ) : (
                  preview
                )}
              </p>
            )}
          </div>
        </button>

        {/* Three-dot menu button */}
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn(
                "shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100",
                menuOpen && "opacity-100"
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
              Rename
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
                  Unpin
                </>
              ) : (
                <>
                  <Pin className="h-4 w-4" />
                  Pin
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteConfirmOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete conversation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this conversation? This action
              cannot be undone and all messages will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
