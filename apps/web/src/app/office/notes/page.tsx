"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, FileText, ChevronRight, ChevronDown, Loader2, X, MessageSquare, Share2, Link, XCircle, Check, Tag, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import dynamic from "next/dynamic";
const NotebookEditor = dynamic(
  () => import("@/components/chat/notebook-editor").then((m) => m.NotebookEditor),
  { ssr: false },
);

// ── Types ─────────────────────────────────────────────────────

interface LinkedConversation {
  conversationId: string;
  title: string;
}

interface UserNote {
  id: string;
  conversationId: string;
  creatorId: string;
  creatorType: "user" | "agent";
  creatorName: string;
  agentId: string | null;
  agentName: string | null;
  title: string;
  content: string;
  tags: string[];
  summary?: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  linkedConversations?: LinkedConversation[];
  shareToken?: string | null;
  isPublic?: boolean;
}

interface ListResponse {
  notes: UserNote[];
  hasMore: boolean;
  nextCursor: string | null;
}

// ── Helpers ───────────────────────────────────────────────────

function useRelativeTime() {
  const { t } = useTranslation();
  return useCallback(
    (date: string): string => {
      const d = new Date(date);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHr = Math.floor(diffMs / 3600000);
      const diffDay = Math.floor(diffMs / 86400000);

      if (diffMin < 1) return t("office.notes.justNow");
      if (diffMin < 60) return t("office.notes.minutesAgo", { count: diffMin });
      if (diffHr < 24) return t("office.notes.hoursAgo", { count: diffHr });
      if (diffDay < 7) return t("office.notes.daysAgo", { count: diffDay });

      const isThisYear = d.getFullYear() === now.getFullYear();
      if (isThisYear) return d.toLocaleDateString([], { month: "short", day: "numeric" });
      return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
    },
    [t],
  );
}

function excerpt(content: string, maxLen = 120): string {
  const text = content.replace(/[#*_~`>\[\]]/g, "").replace(/\n+/g, " ").trim();
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}

// ── Main Page ─────────────────────────────────────────────────

export default function MyNotesPage() {
  const { t } = useTranslation();
  const formatTime = useRelativeTime();
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<UserNote | null>(null);
  const [editingContent, setEditingContent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sharingLoading, setSharingLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounce search input
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Fetch notes
  const fetchNotes = useCallback(
    async (cursor?: string) => {
      const isLoadMore = !!cursor;
      if (isLoadMore) setLoadingMore(true);
      else setLoading(true);

      try {
        const params = new URLSearchParams();
        if (cursor) params.set("before", cursor);
        if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
        if (selectedTag) params.set("tags", selectedTag);
        params.set("limit", "20");

        const data = await api<ListResponse>(
          `/api/users/me/notes?${params.toString()}`,
          { silent: true },
        );

        if (isLoadMore) {
          setNotes((prev) => [...prev, ...data.notes]);
        } else {
          setNotes(data.notes);
        }
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
      } catch {
        // silent
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedSearch, selectedTag],
  );

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Collect all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const note of notes) {
      for (const tag of note.tags) tagSet.add(tag);
    }
    return Array.from(tagSet).sort();
  }, [notes]);

  // Save note content
  const handleSave = useCallback(async () => {
    if (!selectedNote || editingContent === null) return;
    setSaving(true);
    try {
      await api(`/api/conversations/${selectedNote.conversationId}/notes/${selectedNote.id}`, {
        method: "PATCH",
        body: JSON.stringify({ content: editingContent }),
      });
      setNotes((prev) =>
        prev.map((n) =>
          n.id === selectedNote.id
            ? { ...n, content: editingContent, updatedAt: new Date().toISOString() }
            : n,
        ),
      );
      setSelectedNote((prev) =>
        prev ? { ...prev, content: editingContent, updatedAt: new Date().toISOString() } : prev,
      );
      setEditingContent(null);
    } catch {
      // api handles error toast
    } finally {
      setSaving(false);
    }
  }, [selectedNote, editingContent]);

  // Share / unshare handlers
  const handleShare = useCallback(async () => {
    if (!selectedNote) return;
    setSharingLoading(true);
    try {
      const data = await api<{ shareToken: string; shareUrl: string }>(
        `/api/notes/${selectedNote.id}/public-share`,
        { method: "POST" },
      );
      const updated = { ...selectedNote, shareToken: data.shareToken, isPublic: true };
      setSelectedNote(updated);
      setNotes((prev) => prev.map((n) => (n.id === selectedNote.id ? updated : n)));
    } catch {
      // api handles error toast
    } finally {
      setSharingLoading(false);
    }
  }, [selectedNote]);

  const handleStopSharing = useCallback(async () => {
    if (!selectedNote) return;
    setSharingLoading(true);
    try {
      await api(`/api/notes/${selectedNote.id}/public-share`, { method: "DELETE" });
      const updated = { ...selectedNote, shareToken: null, isPublic: false };
      setSelectedNote(updated);
      setNotes((prev) => prev.map((n) => (n.id === selectedNote.id ? updated : n)));
    } catch {
      // api handles error toast
    } finally {
      setSharingLoading(false);
    }
  }, [selectedNote]);

  const handleCopyLink = useCallback(() => {
    if (!selectedNote?.shareToken) return;
    const url = `${window.location.origin}/shared/notes/${selectedNote.shareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }, [selectedNote]);

  const handleDelete = useCallback(async () => {
    if (!selectedNote) return;
    if (!window.confirm(t("chat.notebook.confirmDelete"))) return;
    const noteId = selectedNote.id;
    try {
      await api(`/api/conversations/${selectedNote.conversationId}/notes/${noteId}`, {
        method: "DELETE",
      });
      setSelectedNote(null);
      // Remove from list after sheet close animation to avoid stale render
      setTimeout(() => {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
        fetchNotes();
      }, 300);
    } catch {
      // api handles error toast
    }
  }, [selectedNote, t, fetchNotes]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
        <FileText className="h-4 w-4 text-brand-text" />
        <h1 className="text-sm font-semibold">{t("office.notes.title")}</h1>
      </div>

      {/* Search + Tag Filter */}
      <div className="flex flex-col gap-2 border-b border-border/30 px-4 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("office.notes.search")}
            className="h-8 w-full rounded-md border border-border/50 bg-muted/30 pl-8 pr-8 text-xs placeholder:text-muted-foreground/60 focus:border-brand/40 focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {allTags.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setTagsExpanded((p) => !p)}
              className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground mb-1"
            >
              <Tag className="h-3 w-3" />
              Tags ({allTags.length})
              {selectedTag && <span className="text-brand-text">· #{selectedTag}</span>}
              <ChevronDown className={cn("h-3 w-3 transition-transform", tagsExpanded && "rotate-180")} />
            </button>
            <div className={cn("flex flex-wrap gap-1", !tagsExpanded && "max-h-0 overflow-hidden")}>
              <button
                type="button"
                onClick={() => setSelectedTag(null)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                  !selectedTag
                    ? "bg-brand/15 text-brand-text"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted",
                )}
              >
                {t("office.notes.allTags")}
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                    selectedTag === tag
                      ? "bg-brand/15 text-brand-text"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted",
                  )}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileText className="mb-2 h-8 w-8 opacity-40" />
            <p className="text-xs">{t("office.notes.empty")}</p>
          </div>
        ) : (
          <>
            {notes.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => {
                  setSelectedNote(note);
                  setEditingContent(null);
                }}
                className="flex w-full flex-col gap-1 border-b border-border/20 px-4 py-3 text-left transition-colors hover:bg-muted/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xs font-semibold leading-tight line-clamp-1">
                    {note.title}
                  </h3>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatTime(note.updatedAt)}
                  </span>
                </div>

                {note.content && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
                    {excerpt(note.content)}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  {note.tags.length > 0 && (
                    <div className="flex gap-1">
                      {note.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[9px] text-muted-foreground"
                        >
                          #{tag}
                        </span>
                      ))}
                      {note.tags.length > 3 && (
                        <span className="text-[9px] text-muted-foreground">
                          +{note.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {note.creatorType === "agent" && note.agentName && (
                    <span className="text-[9px] text-muted-foreground/70">
                      {t("office.notes.byAgent", { name: note.agentName })}
                    </span>
                  )}
                </div>
              </button>
            ))}

            {hasMore && (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => nextCursor && fetchNotes(nextCursor)}
                className="flex w-full items-center justify-center py-3 text-xs text-muted-foreground hover:text-foreground"
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("office.notes.loadMore")
                )}
              </button>
            )}
          </>
        )}
      </div>

      {/* Note Detail Sheet */}
      <Sheet open={!!selectedNote} onOpenChange={(open) => !open && setSelectedNote(null)}>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-lg">
          <SheetHeader className="border-b border-border/40 px-4 py-3">
            <SheetTitle className="text-sm">{selectedNote?.title}</SheetTitle>
            <SheetDescription className="text-[11px] text-muted-foreground">
              {selectedNote && formatTime(selectedNote.updatedAt)}
              {selectedNote?.creatorType === "agent" && selectedNote.agentName && (
                <> &middot; {t("office.notes.byAgent", { name: selectedNote.agentName })}</>
              )}
            </SheetDescription>

            {/* Share controls */}
            {selectedNote && (
              <div className="mt-2 flex items-center gap-2">
                {selectedNote.shareToken ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="flex items-center gap-1 rounded-md border border-border/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    >
                      {linkCopied ? (
                        <>
                          <Check className="h-3 w-3 text-green-500" />
                          {t("office.notes.linkCopied")}
                        </>
                      ) : (
                        <>
                          <Link className="h-3 w-3" />
                          {t("office.notes.copyLink")}
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleStopSharing}
                      disabled={sharingLoading}
                      className="flex items-center gap-1 rounded-md border border-red-500/30 px-2 py-1 text-[11px] text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {sharingLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {t("office.notes.stopSharing")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleShare}
                    disabled={sharingLoading}
                    className="flex items-center gap-1 rounded-md border border-border/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
                  >
                    {sharingLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Share2 className="h-3 w-3" />
                    )}
                    {t("office.notes.share")}
                  </button>
                )}
              </div>
            )}
          </SheetHeader>

          {selectedNote && (
            <div className="flex flex-1 flex-col overflow-y-auto">
              {/* Tags */}
              {selectedNote.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 border-b border-border/20 px-4 py-2">
                  {selectedNote.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand-text"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Content — view or edit */}
              <div className="flex-1 px-4 py-3">
                {editingContent !== null ? (
                  <div className="flex h-full flex-col gap-2">
                    <NotebookEditor
                      content={editingContent}
                      onChange={setEditingContent}
                      editable
                    />
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : t("office.notes.save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingContent(null)}
                        className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50"
                      >
                        {t("office.notes.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingContent(selectedNote.content)}
                        className="rounded-md border border-border/40 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      >
                        {t("office.notes.edit")}
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        className="flex items-center gap-1 rounded-md border border-red-500/30 px-2.5 py-1 text-[11px] text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3 w-3" />
                        {t("office.notes.delete")}
                      </button>
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                      <ReactMarkdown>{selectedNote.content || `*${t("office.notes.noContent")}*`}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>

              {/* Linked Conversations */}
              {selectedNote.linkedConversations &&
                selectedNote.linkedConversations.length > 0 && (
                  <div className="border-t border-border/30 px-4 py-3">
                    <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />
                      {t("office.notes.linkedConversations")}
                    </h4>
                    <div className="flex flex-col gap-1">
                      {selectedNote.linkedConversations.map((lc) => (
                        <div
                          key={lc.conversationId}
                          className="flex items-center gap-2 rounded-md bg-muted/30 px-2.5 py-1.5 text-[11px]"
                        >
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          <span className="truncate">{lc.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
