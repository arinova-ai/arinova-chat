"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Note } from "@arinova/shared/types";
import { api } from "@/lib/api";
import { useChatStore } from "@/store/chat-store";
import { useTranslation } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import {
  BookText,
  Plus,
  Pin,
  PinOff,
  Loader2,
  Tag,
  ChevronDown,
  X,
} from "lucide-react";

interface WikiPanelProps {
  conversationId: string;
  inline?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const EMPTY_NOTES: Note[] = [];

export function WikiPanel({ conversationId, inline, open, onOpenChange }: WikiPanelProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const notes = useChatStore((s) => s.notesByConversation[conversationId] ?? EMPTY_NOTES);
  const loadNotes = useChatStore((s) => s.loadNotes);
  const createNote = useChatStore((s) => s.createNote);
  const updateNote = useChatStore((s) => s.updateNote);

  const [loading, setLoading] = useState(false);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [contextMenuNoteId, setContextMenuNoteId] = useState<string | null>(null);

  // Escape key closes mobile overlay
  useEffect(() => {
    if (inline || !open || !onOpenChange) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [inline, open, onOpenChange]);

  useEffect(() => {
    if (conversationId) {
      setLoading(true);
      loadNotes(conversationId, { tags: filterTags.length ? filterTags : undefined }).finally(() =>
        setLoading(false),
      );
    }
  }, [conversationId, loadNotes, filterTags]);

  // Collect all tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach((n) => n.tags?.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet).sort();
  }, [notes]);

  const toggleFilterTag = useCallback((tag: string) => {
    setFilterTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  // Sort: pinned first, then by updatedAt
  const sortedNotes = useMemo(() => {
    const active = notes.filter((n) => !n.archivedAt);
    return [...active].sort((a, b) => {
      const aPinned = (a as Note & { isPinned?: boolean }).isPinned ? 1 : 0;
      const bPinned = (b as Note & { isPinned?: boolean }).isPinned ? 1 : 0;
      if (bPinned !== aPinned) return bPinned - aPinned;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [notes]);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;
    await createNote(conversationId, title, "");
    setNewTitle("");
    setCreating(false);
  };

  const handleTogglePin = async (note: Note) => {
    const isPinned = (note as Note & { isPinned?: boolean }).isPinned ?? false;
    await updateNote(conversationId, note.id, { isPinned: !isPinned });
    loadNotes(conversationId, { tags: filterTags.length ? filterTags : undefined });
  };

  function formatTime(date: string): string {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  const content = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <BookText className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold flex-1">{t("wiki.title")}</span>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          title={t("wiki.create")}
        >
          <Plus className="h-4 w-4" />
        </button>
        {!inline && onOpenChange && (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors ml-1"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Create input */}
      {creating && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setCreating(false); setNewTitle(""); }
            }}
            placeholder={t("wiki.titlePlaceholder")}
            className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={handleCreate}
            className="rounded-md px-2 py-1 text-xs font-medium bg-brand text-white hover:bg-brand/90 transition-colors"
          >
            {t("wiki.add")}
          </button>
        </div>
      )}

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="px-3 pt-2 pb-1">
          <button
            type="button"
            onClick={() => setTagsExpanded((p) => !p)}
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground mb-1"
          >
            <Tag className="h-3 w-3" />
            Tags ({allTags.length})
            <ChevronDown className={cn("h-3 w-3 transition-transform", tagsExpanded && "rotate-180")} />
          </button>
          <div className={cn("flex flex-wrap gap-1", !tagsExpanded && "max-h-0 overflow-hidden")}>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleFilterTag(tag)}
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                  filterTags.includes(tag)
                    ? "bg-brand/20 text-brand-text"
                    : "bg-secondary text-muted-foreground hover:bg-accent",
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sortedNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
            <BookText className="h-8 w-8 mb-2 opacity-50" />
            {t("wiki.empty")}
          </div>
        ) : (
          sortedNotes.map((note) => {
            const isPinned = (note as Note & { isPinned?: boolean }).isPinned ?? false;
            return (
              <div
                key={note.id}
                className="group relative flex items-start px-3 py-2.5 hover:bg-muted/50 transition-colors border-b border-border/50"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenuNoteId(contextMenuNoteId === note.id ? null : note.id);
                }}
              >
                {isPinned && <Pin className="h-3 w-3 text-brand-text mr-2 mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{note.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{formatTime(note.updatedAt)}</span>
                    {note.creatorName && (
                      <span className="text-[10px] text-muted-foreground">by {note.creatorName}</span>
                    )}
                    {note.tags && note.tags.length > 0 && (
                      <div className="flex gap-0.5">
                        {note.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="rounded-full bg-secondary px-1.5 py-0 text-[9px] text-muted-foreground">
                            {tag}
                          </span>
                        ))}
                        {note.tags.length > 2 && (
                          <span className="text-[9px] text-muted-foreground">+{note.tags.length - 2}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Pin/Unpin button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePin(note);
                  }}
                  className={cn(
                    "rounded-md p-1 transition-colors shrink-0",
                    isPinned
                      ? "text-brand-text hover:text-brand-text/70"
                      : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground",
                  )}
                  title={isPinned ? t("wiki.unpin") : t("wiki.pin")}
                >
                  {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // Inline mode (right panel)
  if (inline) return content;

  // Mobile portal overlay
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {content}
    </div>,
    document.body,
  );
}
