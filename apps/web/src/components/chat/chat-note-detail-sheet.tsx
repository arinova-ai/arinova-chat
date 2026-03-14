"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, Loader2, Tag, Clock, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { api } from "@/lib/api";
import { useChatStore } from "@/store/chat-store";
import { useTranslation } from "@/lib/i18n";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

interface NoteData {
  id: string;
  title: string;
  content: string;
  tags: string[];
  creatorName: string;
  agentName: string | null;
  createdAt: string;
  updatedAt: string;
  summary: string | null;
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function ChatNoteDetailSheet() {
  const { t } = useTranslation();
  const chatNoteDetailId = useChatStore((s) => s.chatNoteDetailId);
  const [note, setNote] = useState<NoteData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchNote = useCallback(async (noteId: string) => {
    setLoading(true);
    try {
      const data = await api<NoteData>(
        `/api/notes/${noteId}`,
        { silent: true },
      );
      setNote(data);
    } catch {
      useChatStore.setState({ chatNoteDetailId: null });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (chatNoteDetailId) {
      fetchNote(chatNoteDetailId);
    } else {
      setNote(null);
    }
  }, [chatNoteDetailId, fetchNote]);

  const handleClose = () => {
    useChatStore.setState({ chatNoteDetailId: null });
  };

  return (
    <Sheet open={chatNoteDetailId !== null} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <SheetContent side="right" className="w-80 sm:w-96 border-border bg-background">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-brand" />
            {t("noteDetail.title")}
          </SheetTitle>
          <SheetDescription className="sr-only">{t("noteDetail.title")}</SheetDescription>
        </SheetHeader>

        {loading && !note && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {note && (
          <div className="mt-4 space-y-4 px-1 overflow-y-auto max-h-[calc(100vh-8rem)]">
            {/* Title */}
            <div>
              <h3 className="text-base font-semibold text-foreground">{note.title || t("noteDetail.untitled")}</h3>
            </div>

            {/* Tags */}
            {note.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {note.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Summary */}
            {note.summary && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("noteDetail.summary")}</label>
                <p className="mt-1 text-sm text-foreground/80 italic">{note.summary}</p>
              </div>
            )}

            {/* Content */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("noteDetail.content")}</label>
              <div className="mt-1 text-sm text-foreground prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-code:text-foreground prose-pre:bg-muted">
                <ReactMarkdown>{note.content || t("noteDetail.noContent")}</ReactMarkdown>
              </div>
            </div>

            {/* Metadata */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{t("noteDetail.created")}: {formatTime(note.createdAt)}</span>
              </div>
              {note.updatedAt && note.updatedAt !== note.createdAt && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{t("noteDetail.updated")}: {formatTime(note.updatedAt)}</span>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                {t("noteDetail.by")}: {note.agentName || note.creatorName}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
