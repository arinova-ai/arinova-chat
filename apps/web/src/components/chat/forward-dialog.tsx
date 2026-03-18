"use client";

import { useState, useCallback } from "react";
import { useChatStore } from "@/store/chat-store";
import { api } from "@/lib/api";
import { Forward, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTranslation } from "@/lib/i18n";

interface ForwardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string;
}

export function ForwardDialog({ open, onOpenChange, messageId }: ForwardDialogProps) {
  const { t } = useTranslation();
  const conversations = useChatStore((s) => s.conversations);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);

  const filtered = conversations.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.agentName?.toLowerCase().includes(q) ||
      c.title?.toLowerCase().includes(q)
    );
  });

  const handleForward = useCallback(async (targetConversationId: string) => {
    setSending(true);
    try {
      await api(`/api/conversations/${targetConversationId}/messages/forward`, {
        method: "POST",
        body: JSON.stringify({ messageId }),
      });
      onOpenChange(false);
    } catch {
      // silently ignore
    } finally {
      setSending(false);
    }
  }, [messageId, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => onOpenChange(false)}>
      <div
        className="w-full max-w-sm mx-4 rounded-xl bg-background border border-border shadow-2xl flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Forward className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm flex-1">{t("chat.actions.forward") || "Forward to..."}</span>
          <button type="button" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("chat.search.placeholder") || "Search conversations..."}
              className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {filtered.map((c) => {
            const name = c.agentName || c.title || "Chat";
            return (
              <button
                key={c.id}
                type="button"
                disabled={sending}
                onClick={() => handleForward(c.id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-xs">{name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-sm truncate">{name}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">No conversations found</p>
          )}
        </div>
      </div>
    </div>
  );
}
