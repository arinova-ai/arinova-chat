"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, Users, MessageCircle, Loader2 } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { useToastStore } from "@/store/toast-store";
import { assetUrl, AGENT_DEFAULT_AVATAR } from "@/lib/config";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";

interface ShareToConversationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: string;
  noteId?: string;
  cardId?: string;
}

export function ShareToConversationSheet({
  open,
  onOpenChange,
  content,
  noteId,
  cardId,
}: ShareToConversationSheetProps) {
  const { t } = useTranslation();
  const conversations = useChatStore((s) => s.conversations);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const setInputDraft = useChatStore((s) => s.setInputDraft);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const [sending, setSending] = useState<string | null>(null);

  // Load conversations if store is empty (e.g. opened from Kanban page)
  useEffect(() => {
    if (open && conversations.length === 0) {
      loadConversations();
    }
  }, [open, conversations.length, loadConversations]);

  // Show all conversations including current one
  const filtered = conversations;

  const handleSelect = async (conversationId: string) => {
    if (noteId) {
      // Rich Card via API — note
      setSending(conversationId);
      try {
        await api(`/api/notes/${noteId}/share-to/${conversationId}`, {
          method: "POST",
        });
        useToastStore.getState().addToast(t("share.sentToConversation"), "success");
        onOpenChange(false);
      } catch {
        // api handles error toast
      } finally {
        setSending(null);
      }
    } else if (cardId) {
      // Rich Card via API — kanban card
      setSending(conversationId);
      try {
        await api(`/api/kanban/cards/${cardId}/share-to/${conversationId}`, {
          method: "POST",
        });
        useToastStore.getState().addToast(t("share.sentToConversation"), "success");
        onOpenChange(false);
      } catch {
        // api handles error toast
      } finally {
        setSending(null);
      }
    } else {
      // Plain text fallback
      const existing = useChatStore.getState().inputDrafts[conversationId] ?? "";
      const prefix = existing ? existing + "\n" : "";
      setInputDraft(conversationId, prefix + content);
      setActiveConversation(conversationId);
      onOpenChange(false);
      useToastStore.getState().addToast(t("share.sentToConversation"), "success");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="rounded-t-2xl border-border bg-secondary px-2 pt-3"
        style={{
          paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
          maxHeight: "70vh",
        }}
      >
        <SheetHeader className="px-2 pb-2">
          <SheetTitle className="text-sm">{t("share.sendToConversation")}</SheetTitle>
        </SheetHeader>

        {/* Drag handle */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />

        <div className="overflow-y-auto max-h-[55vh] px-1">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <MessageCircle className="h-5 w-5 mr-2" />
              {t("chat.noConversations")}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filtered.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  disabled={sending !== null}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left active:bg-accent hover:bg-accent/50 transition-colors disabled:opacity-50"
                  onClick={() => handleSelect(conv.id)}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    {conv.type === "direct" && (
                      <AvatarImage
                        src={conv.agentAvatarUrl ? assetUrl(conv.agentAvatarUrl) : AGENT_DEFAULT_AVATAR}
                        alt={conv.agentName}
                        className="object-cover"
                      />
                    )}
                    <AvatarFallback className="bg-accent text-foreground/80 text-xs">
                      {conv.type === "group" ? (
                        <Users className="h-4 w-4" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm font-medium">
                    {conv.title ?? conv.agentName}
                  </span>
                  {sending === conv.id && (
                    <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
