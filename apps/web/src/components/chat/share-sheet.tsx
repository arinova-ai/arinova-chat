"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "radix-ui";
import { MessageCircle, Share2, Copy } from "lucide-react";
import { shareExternal, copyToClipboard } from "@/lib/share";
import { api } from "@/lib/api";
import { ShareToConversationSheet } from "./share-to-conversation-sheet";
import { useTranslation } from "@/lib/i18n";

export interface ShareContent {
  type: "note" | "message" | "task";
  title: string;
  text: string;
  url?: string;
  noteId?: string;
  cardId?: string;
}

interface ShareSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: ShareContent | null;
}

const ACTION_BUTTON =
  "flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm text-foreground active:bg-accent cursor-pointer";

export function ShareSheet({ open, onOpenChange, content }: ShareSheetProps) {
  const { t } = useTranslation();
  const [conversationSheetOpen, setConversationSheetOpen] = useState(false);

  if (!content) return null;

  const handleSendToConversation = () => {
    onOpenChange(false);
    // Small delay to let the first sheet close before opening the next
    setTimeout(() => setConversationSheetOpen(true), 150);
  };

  const handleShareExternal = async () => {
    if (content.noteId) {
      try {
        const res = await api<{ shareToken: string }>(
          `/api/notes/${content.noteId}/public-share`,
          { method: "POST" },
        );
        const url = `${window.location.origin}/shared/notes/${res.shareToken}`;
        await shareExternal({ title: content.title, text: content.text, url });
      } catch {
        // api handles error toast
      }
    } else if (content.cardId) {
      try {
        const res = await api<{ shareToken: string }>(
          `/api/kanban/cards/${content.cardId}/public-share`,
          { method: "POST" },
        );
        const url = `${window.location.origin}/shared/cards/${res.shareToken}`;
        await shareExternal({ title: content.title, text: content.text, url });
      } catch {
        // api handles error toast
      }
    } else {
      await shareExternal({
        title: content.title,
        text: content.text,
        url: content.url,
      });
    }
    onOpenChange(false);
  };

  const handleCopy = async () => {
    await copyToClipboard(content.text);
    onOpenChange(false);
  };

  const shareText = content.type === "note" || content.type === "task"
    ? `[${content.title}]\n${content.text}`
    : content.text;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-2xl border-border bg-secondary px-2 pt-3"
          style={{
            paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <VisuallyHidden.Root>
            <SheetTitle>{t("share.title")}</SheetTitle>
          </VisuallyHidden.Root>

          {/* Drag handle */}
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />

          <div className="flex flex-col">
            <button className={ACTION_BUTTON} onClick={handleSendToConversation}>
              <MessageCircle className="h-4 w-4 text-blue-400" />
              <span className="text-blue-400">{t("share.sendToConversation")}</span>
            </button>
            <button className={ACTION_BUTTON} onClick={handleShareExternal}>
              <Share2 className="h-4 w-4 text-green-400" />
              <span className="text-green-400">{t("share.shareExternal")}</span>
            </button>
            <button className={ACTION_BUTTON} onClick={handleCopy}>
              <Copy className="h-4 w-4 text-muted-foreground" />
              {t("share.copyContent")}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <ShareToConversationSheet
        open={conversationSheetOpen}
        onOpenChange={setConversationSheetOpen}
        content={shareText}
        noteId={content.noteId}
        cardId={content.cardId}
      />
    </>
  );
}
