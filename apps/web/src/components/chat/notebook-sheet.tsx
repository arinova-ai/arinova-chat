"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Note } from "@arinova/shared/types";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import dynamic from "next/dynamic";
const NotebookEditor = dynamic(() => import("./notebook-editor").then((m) => m.NotebookEditor), { ssr: false });
import {
  BookOpen,
  Plus,
  ArrowLeft,
  Pencil,
  Trash2,
  Loader2,
  Settings,
  X,
  Pin,
  Share2,
  Archive,
  ArchiveRestore,
  Tag,
  Link2,
  Brain,
  Sparkles,
  Bot,
  Send,
  ChevronDown,
} from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { useTranslation } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import { ShareSheet, type ShareContent } from "./share-sheet";
import { Input } from "@/components/ui/input";

interface NotebookSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  inline?: boolean;
}

const EMPTY_NOTES: Note[] = [];

type ViewMode = "list" | "detail" | "edit" | "create";

// Swipe constants (matching conversation-item pattern)
const SWIPE_THRESHOLD = 60;
const SWIPE_ACTION_WIDTH = 120;
const SWIPE_DELETE_WIDTH = 70;

function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  const isThisYear = d.getFullYear() === now.getFullYear();
  if (isThisYear) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function SwipeableNoteItem({
  note,
  isMobile,
  onOpen,
  onDelete,
  onShare,
  t,
}: {
  note: Note;
  isMobile: boolean;
  onOpen: (note: Note) => void;
  onDelete: (note: Note) => void;
  onShare: (note: Note) => void;
  t: (key: string) => string;
}) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipingRef = useRef(false);
  const startOffsetRef = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    startOffsetRef.current = swipeOffset;
    swipingRef.current = false;
  }, [swipeOffset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    if (!swipingRef.current && Math.abs(dy) > Math.abs(dx)) {
      touchStartRef.current = null;
      return;
    }
    if (Math.abs(dx) > 10) swipingRef.current = true;

    if (swipingRef.current) {
      const raw = startOffsetRef.current + dx;
      let clamped: number;
      if (startOffsetRef.current > 0) {
        clamped = Math.max(0, Math.min(SWIPE_ACTION_WIDTH, raw));
      } else if (startOffsetRef.current < 0) {
        clamped = Math.max(-SWIPE_DELETE_WIDTH, Math.min(0, raw));
      } else {
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

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Left actions (right swipe): Pin + Share — mobile only */}
      {isMobile && (
        <div
          className="absolute inset-y-0 left-0 flex items-stretch md:hidden"
          style={{ width: SWIPE_ACTION_WIDTH }}
        >
          <button
            type="button"
            className="flex flex-1 flex-col items-center justify-center gap-0.5 bg-yellow-500 text-white"
            onClick={resetSwipe}
          >
            <Pin className="h-4 w-4" />
            <span className="text-[10px] font-medium">{t("chat.actions.pin")}</span>
          </button>
          <button
            type="button"
            className="flex flex-1 flex-col items-center justify-center gap-0.5 bg-blue-500 text-white"
            onClick={() => { resetSwipe(); onShare(note); }}
          >
            <Share2 className="h-4 w-4" />
            <span className="text-[10px] font-medium">{t("chat.actions.share")}</span>
          </button>
        </div>
      )}

      {/* Right action (left swipe): Delete — mobile only */}
      {isMobile && (
        <div
          className="absolute inset-y-0 right-0 flex items-stretch md:hidden"
          style={{ width: SWIPE_DELETE_WIDTH }}
        >
          <button
            type="button"
            className="flex flex-1 flex-col items-center justify-center gap-0.5 bg-red-500 text-white"
            onClick={() => { resetSwipe(); onDelete(note); }}
          >
            <Trash2 className="h-4 w-4" />
            <span className="text-[10px] font-medium">{t("common.delete")}</span>
          </button>
        </div>
      )}

      {/* Content */}
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("application/x-arinova-note", JSON.stringify({ id: note.id, title: note.title || t("common.untitled") }));
          e.dataTransfer.effectAllowed = "copy";
        }}
        className={cn(
          "flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left active:bg-accent hover:bg-accent/60 transition-colors cursor-grab active:cursor-grabbing bg-secondary",
          swipeOffset === 0 && "transition-transform duration-200",
          swipeOffset !== 0 && !swipingRef.current && "transition-transform duration-200",
        )}
        style={isMobile ? { transform: `translateX(${swipeOffset}px)` } : undefined}
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchMove={isMobile ? handleTouchMove : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
        onClick={() => { if (!swipingRef.current) onOpen(note); }}
      >
        <p className="text-sm font-semibold truncate">
          {note.title || t("common.untitled")}
        </p>
        {(note.summary || note.content) && (
          <p className="text-xs text-muted-foreground line-clamp-2 break-words">
            {note.summary || note.content}
          </p>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          <span>{note.creatorName}</span>
          <span>&middot;</span>
          <span suppressHydrationWarning>{formatTime(note.updatedAt)}</span>
        </div>
      </button>
    </div>
  );
}

export function NotebookSheet({ open, onOpenChange, conversationId, inline }: NotebookSheetProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isMobileRaw = useIsMobile();
  const isMobile = mounted ? isMobileRaw : false;
  const notes = useChatStore((s) => s.notesByConversation[conversationId] ?? EMPTY_NOTES);
  const loadNotes = useChatStore((s) => s.loadNotes);
  const createNote = useChatStore((s) => s.createNote);
  const updateNote = useChatStore((s) => s.updateNote);
  const deleteNote = useChatStore((s) => s.deleteNote);
  const archiveNote = useChatStore((s) => s.archiveNote);
  const unarchiveNote = useChatStore((s) => s.unarchiveNote);
  const shareNoteApi = useChatStore((s) => s.shareNote);
  const currentUserId = useChatStore((s) => s.currentUserId);
  const agentNotesEnabled = useChatStore(
    (s) => s.agentNotesEnabledByConversation[conversationId] ?? true
  );
  const toggleAgentNotesEnabled = useChatStore((s) => s.toggleAgentNotesEnabled);
  const pendingNoteId = useChatStore((s) => s.pendingNoteId);

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [contentInput, setContentInput] = useState("");
  const [tagsInput, setTagsInput] = useState<string[]>([]);
  const [tagInputValue, setTagInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareContent, setShareContent] = useState<ShareContent | null>(null);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  // Tag suggestions state
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  // Auto tag state
  const [autoTagging, setAutoTagging] = useState(false);
  // Ask AI state
  const [askAiOpen, setAskAiOpen] = useState(false);
  const [askAiQuestion, setAskAiQuestion] = useState("");
  const [askAiAnswer, setAskAiAnswer] = useState("");
  const [askAiLoading, setAskAiLoading] = useState(false);

  useEffect(() => {
    if (open && conversationId) {
      setLoading(true);
      loadNotes(conversationId, { archived: showArchived, tags: filterTags.length ? filterTags : undefined }).finally(() => {
        setLoading(false);
        setNotesLoaded(true);
      });
    }
  }, [open, conversationId, loadNotes, showArchived, filterTags]);

  useEffect(() => {
    if (!open) {
      setViewMode("list");
      setSelectedNote(null);
      setTitleInput("");
      setContentInput("");
      setTagsInput([]);
      setTagInputValue("");
      setSettingsOpen(false);
      setShowArchived(false);
      setFilterTags([]);
      setSuggestedTags([]);
      setAskAiOpen(false);
      setAskAiQuestion("");
      setAskAiAnswer("");
      setAskAiLoading(false);
    }
  }, [open]);

  useEffect(() => {
    setNotesLoaded(false);
  }, [conversationId]);

  // Navigate to a specific note when pendingNoteId is set
  useEffect(() => {
    if (!pendingNoteId || !notesLoaded) return;
    const note = notes.find((n) => n.id === pendingNoteId);
    if (note) {
      setSelectedNote(note);
      setViewMode("detail");
      // Fetch full note
      api(`/api/conversations/${conversationId}/notes/${note.id}`)
        .then((full) => setSelectedNote(full as Note))
        .catch(() => {});
    }
    useChatStore.setState({ pendingNoteId: null });
  }, [pendingNoteId, notesLoaded, notes, conversationId]);

  const handleOpenNote = useCallback(async (note: Note) => {
    setSelectedNote(note);
    setViewMode("detail");
    // Fetch full note to get backlinks and linkedCards
    try {
      const full = await api(`/api/conversations/${conversationId}/notes/${note.id}`) as Note;
      setSelectedNote(full);
    } catch { /* keep list data if fetch fails */ }
  }, [conversationId]);

  const handleStartCreate = useCallback(() => {
    setTitleInput("");
    setContentInput("");
    setTagsInput([]);
    setTagInputValue("");
    setViewMode("create");
  }, []);

  const handleStartEdit = useCallback(() => {
    if (!selectedNote) return;
    setTitleInput(selectedNote.title);
    setContentInput(selectedNote.content);
    setTagsInput(selectedNote.tags ?? []);
    setTagInputValue("");
    setViewMode("edit");
  }, [selectedNote]);

  const handleBack = useCallback(() => {
    if (viewMode === "edit" || viewMode === "create") {
      if (selectedNote) {
        setViewMode("detail");
      } else {
        setViewMode("list");
      }
    } else {
      setSelectedNote(null);
      setViewMode("list");
    }
  }, [viewMode, selectedNote]);

  const handleCreate = useCallback(async () => {
    if (!titleInput.trim()) return;
    setLoading(true);
    try {
      const note = await createNote(conversationId, titleInput.trim(), contentInput, tagsInput);
      if (note.suggestedTags?.length) {
        setSuggestedTags(note.suggestedTags.filter((t) => !tagsInput.includes(t)));
      }
      setSelectedNote(note);
      setViewMode("detail");
    } catch {
      // Error toast handled by api()
    } finally {
      setLoading(false);
    }
  }, [conversationId, titleInput, contentInput, tagsInput, createNote]);

  const handleSave = useCallback(async () => {
    if (!selectedNote || !titleInput.trim()) return;
    setLoading(true);
    try {
      await updateNote(conversationId, selectedNote.id, {
        title: titleInput.trim(),
        content: contentInput,
        tags: tagsInput,
      });
      setSelectedNote({
        ...selectedNote,
        title: titleInput.trim(),
        content: contentInput,
        tags: tagsInput,
        updatedAt: new Date().toISOString(),
      });
      setViewMode("detail");
    } catch {
      // Error toast handled by api()
    } finally {
      setLoading(false);
    }
  }, [selectedNote, conversationId, titleInput, contentInput, tagsInput, updateNote]);

  const handleDelete = useCallback(async (note?: Note) => {
    const target = note || selectedNote;
    if (!target) return;
    if (!window.confirm(t("chat.notebook.confirmDelete"))) return;
    setLoading(true);
    try {
      await deleteNote(conversationId, target.id);
      if (selectedNote?.id === target.id) {
        setSelectedNote(null);
        setViewMode("list");
      }
    } catch {
      // Error toast handled by api()
    } finally {
      setLoading(false);
    }
  }, [selectedNote, conversationId, deleteNote, t]);

  const handleShareNote = useCallback((note: Note) => {
    setShareContent({
      type: "note",
      title: note.title || "Untitled",
      text: note.content || "",
      noteId: note.id,
    });
    setShareSheetOpen(true);
  }, []);

  const handleArchiveNote = useCallback(async (note?: Note) => {
    const target = note || selectedNote;
    if (!target) return;
    setLoading(true);
    try {
      await archiveNote(conversationId, target.id);
      if (selectedNote?.id === target.id) {
        setSelectedNote(null);
        setViewMode("list");
      }
    } catch { /* api shows toast */ }
    setLoading(false);
  }, [selectedNote, conversationId, archiveNote]);

  const handleUnarchiveNote = useCallback(async (note: Note) => {
    setLoading(true);
    try {
      await unarchiveNote(conversationId, note.id);
    } catch { /* api shows toast */ }
    setLoading(false);
  }, [conversationId, unarchiveNote]);

  const handleShareNoteToChat = useCallback(async (note?: Note) => {
    const target = note || selectedNote;
    if (!target) return;
    setLoading(true);
    try {
      await shareNoteApi(conversationId, target.id);
    } catch { /* api shows toast */ }
    setLoading(false);
  }, [selectedNote, conversationId, shareNoteApi]);

  const handleAutoTag = useCallback(async () => {
    if (!selectedNote) return;
    setAutoTagging(true);
    try {
      const res = await api<{ tags: string[] }>(
        `/api/conversations/${conversationId}/notes/${selectedNote.id}/auto-tag`,
        { method: "POST" }
      );
      if (res.tags?.length) {
        setSelectedNote({ ...selectedNote, tags: res.tags });
      }
    } catch { /* api shows toast */ }
    setAutoTagging(false);
  }, [selectedNote, conversationId]);

  const handleAcceptSuggestedTag = useCallback(async (tag: string) => {
    if (!selectedNote) return;
    const newTags = [...(selectedNote.tags ?? []), tag];
    setSuggestedTags((prev) => prev.filter((t) => t !== tag));
    try {
      await updateNote(conversationId, selectedNote.id, { tags: newTags });
      setSelectedNote({ ...selectedNote, tags: newTags });
    } catch { /* api shows toast */ }
  }, [selectedNote, conversationId, updateNote]);

  const handleDismissSuggestedTags = useCallback(() => {
    setSuggestedTags([]);
  }, []);

  const handleAskAi = async () => {
    if (!selectedNote || !askAiQuestion.trim()) return;
    setAskAiLoading(true);
    setAskAiAnswer("");
    try {
      const res = await api<{ answer: string }>(`/api/conversations/${conversationId}/notes/${selectedNote.id}/ask-ai`, {
        method: "POST",
        body: JSON.stringify({ question: askAiQuestion.trim() }),
      });
      setAskAiAnswer(res.answer);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setAskAiAnswer(error?.message || "Failed to get answer");
    }
    setAskAiLoading(false);
  };

  const handleAddTag = useCallback((tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tagsInput.includes(trimmed)) {
      setTagsInput([...tagsInput, trimmed]);
    }
    setTagInputValue("");
  }, [tagsInput]);

  const handleRemoveTag = useCallback((tag: string) => {
    setTagsInput(tagsInput.filter((t) => t !== tag));
  }, [tagsInput]);

  const toggleFilterTag = useCallback((tag: string) => {
    setFilterTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  // Collect tag counts from notes for filter UI
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of notes) {
      for (const tag of note.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return counts;
  }, [notes]);
  const allTags = Array.from(tagCounts.keys());

  const handleToggleAgentNotes = useCallback(
    (checked: boolean) => {
      toggleAgentNotesEnabled(conversationId, checked);
    },
    [conversationId, toggleAgentNotesEnabled]
  );

  const canEdit = selectedNote && selectedNote.creatorId === currentUserId;

  if (!open) return null;

  const panel = (
      <div
        className={inline ? "flex flex-col h-full bg-background" : "fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in"}
        style={inline ? undefined : {
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
      <div className="flex flex-col h-full w-full max-w-4xl mx-auto">

        {/* List View */}
        {viewMode === "list" && (
          <div className="flex flex-col h-full">
            <div className={cn(
              "shrink-0",
              isMobile ? "px-2 pb-3" : "px-4 pt-4 pb-3 border-b"
            )}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4" />
                  {t("chat.notebook.title")}
                </h3>
                <div className="flex items-center gap-1">
                  <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title={t("chat.notebook.settings")}>
                        <Settings className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-64 p-3" side={isMobile ? "top" : "left"}>
                      <div className="flex items-center justify-between gap-3">
                        <label htmlFor="agent-notes-toggle" className="text-xs font-medium leading-tight cursor-pointer select-none flex-1">
                          {t("chat.notebook.agentAccess")}
                        </label>
                        <Switch id="agent-notes-toggle" checked={agentNotesEnabled} onCheckedChange={handleToggleAgentNotes} />
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleStartCreate} title={t("chat.notebook.create")}>
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Tabs: Active / Archived */}
            <div className={cn("flex items-center gap-1 border-b border-border shrink-0", isMobile ? "px-2 pb-1" : "px-4 pb-1")}>
              <button
                type="button"
                onClick={() => setShowArchived(false)}
                className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-colors", !showArchived ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {t("chat.notebook.active")}
              </button>
              <button
                type="button"
                onClick={() => setShowArchived(true)}
                className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-colors", showArchived ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <Archive className="h-3 w-3 inline mr-1" />
                {t("chat.notebook.archived")}
              </button>
            </div>

            {/* Tag statistics panel */}
            {allTags.length > 0 && (
              <div className={cn("shrink-0", isMobile ? "px-2 py-1.5" : "px-4 py-1.5")}>
                {isMobile && (
                  <button
                    type="button"
                    onClick={() => setTagsExpanded((p) => !p)}
                    className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground mb-1"
                  >
                    <Tag className="h-3 w-3" />
                    Tags ({allTags.length})
                    <ChevronDown className={cn("h-3 w-3 transition-transform", tagsExpanded && "rotate-180")} />
                  </button>
                )}
                <div className={cn(
                  "flex flex-wrap gap-1",
                  isMobile && !tagsExpanded && "max-h-0 overflow-hidden",
                )}>
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleFilterTag(tag)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                        filterTags.includes(tag)
                          ? "bg-brand text-white"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      <Tag className="h-2.5 w-2.5" />
                      {tag}
                      <span className={cn(
                        "inline-flex items-center justify-center rounded-full min-w-[16px] h-4 px-1 text-[9px] font-semibold",
                        filterTags.includes(tag)
                          ? "bg-white/20 text-white"
                          : "bg-foreground/10 text-muted-foreground"
                      )}>
                        {tagCounts.get(tag) ?? 0}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto px-1">
              {loading && notes.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : notes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <BookOpen className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">{t("chat.notebook.empty")}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {notes.map((note) => (
                    <div key={note.id} className="relative">
                      {showArchived ? (
                        <div className="flex items-center gap-1 rounded-lg px-3 py-2.5 bg-secondary hover:bg-accent/60 transition-colors">
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleOpenNote(note)}>
                            <p className="text-sm font-semibold truncate">{note.title || t("common.untitled")}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <span>{note.creatorName}</span>
                              <span>&middot;</span>
                              <span suppressHydrationWarning>{formatTime(note.updatedAt)}</span>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleUnarchiveNote(note)} title={t("chat.notebook.unarchive")}>
                            <ArchiveRestore className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <SwipeableNoteItem
                          note={note}
                          isMobile={isMobile}
                          onOpen={handleOpenNote}
                          onDelete={handleDelete}
                          onShare={handleShareNote}
                          t={t}
                        />
                      )}
                      {/* Tag badges */}
                      {note.tags && note.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 px-3 pb-1.5 -mt-1">
                          {note.tags.map((tag) => (
                            <span key={tag} className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              <Tag className="h-2 w-2" />
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Detail View */}
        {viewMode === "detail" && selectedNote && (
          <div className="flex flex-col h-full">
            <div className={cn("flex items-center gap-2 shrink-0", isMobile ? "px-2 pb-3" : "px-4 pt-4 pb-3 border-b")}>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h3 className="text-sm font-semibold truncate flex-1">{selectedNote.title || t("common.untitled")}</h3>
              <div className="flex items-center gap-1">
                {canEdit && (
                  <>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleStartEdit} title={t("chat.notebook.edit")}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete()} disabled={loading} title={t("common.delete")}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className={cn("flex-1 min-h-0 overflow-y-auto", isMobile ? "px-3 py-2" : "px-4 py-3")}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <span>{selectedNote.creatorName}</span>
                <span>&middot;</span>
                <span suppressHydrationWarning>{formatTime(selectedNote.updatedAt)}</span>
              </div>
              {/* Tags */}
              {selectedNote.tags && selectedNote.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {selectedNote.tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-0.5 rounded-full bg-brand/10 text-brand-text px-2 py-0.5 text-[10px] font-medium">
                      <Tag className="h-2.5 w-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {selectedNote.content ? (
                <NotebookEditor content={selectedNote.content} editable={false} conversationId={conversationId} />
              ) : (
                <p className="text-sm text-muted-foreground italic">{t("chat.notebook.noContent")}</p>
              )}
              {/* Backlinks */}
              {selectedNote.backlinks && selectedNote.backlinks.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border">
                  <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
                    <Link2 className="h-3 w-3" />
                    Backlinks
                  </h4>
                  <div className="flex flex-col gap-1">
                    {selectedNote.backlinks.map((bl) => (
                      <button
                        key={bl.id}
                        type="button"
                        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-brand-text hover:bg-accent transition-colors text-left"
                        onClick={() => {
                          const backlinkedNote = notes.find((n) => n.id === bl.id);
                          if (backlinkedNote) {
                            handleOpenNote(backlinkedNote);
                          }
                        }}
                      >
                        <BookOpen className="h-3 w-3 shrink-0" />
                        <span className="truncate">{bl.title || "Untitled"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Linked Kanban Cards */}
              {selectedNote.linkedCards && selectedNote.linkedCards.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border">
                  <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
                    <Pin className="h-3 w-3" />
                    Linked Cards
                  </h4>
                  <div className="flex flex-col gap-1">
                    {selectedNote.linkedCards.map((lc) => (
                      <div
                        key={lc.id}
                        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground"
                      >
                        <Pin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{lc.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Related Capsules (Task 3) */}
              {selectedNote.relatedCapsules && selectedNote.relatedCapsules.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border">
                  <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
                    <Brain className="h-3 w-3" />
                    Related Memories
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {selectedNote.relatedCapsules.map((cap) => (
                      <div key={cap.id} className="rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs">
                        <p className="text-foreground">{cap.content}</p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                          <span>{cap.capsuleName}</span>
                          {(cap.sourceStart || cap.sourceEnd) && (
                            <>
                              <span>&middot;</span>
                              <span suppressHydrationWarning>
                                {cap.sourceStart ? new Date(cap.sourceStart).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "?"}
                                {" ~ "}
                                {cap.sourceEnd ? new Date(cap.sourceEnd).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "?"}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Suggested Tags (Task 4) */}
              {suggestedTags.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    <span className="text-xs font-medium text-muted-foreground">Suggested tags</span>
                    <button type="button" onClick={handleDismissSuggestedTags} className="ml-auto text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {suggestedTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[10px] font-medium hover:bg-amber-500/20 transition-colors"
                        onClick={() => handleAcceptSuggestedTag(tag)}
                      >
                        <Plus className="h-2.5 w-2.5" />
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* Bottom Toolbar */}
            <div className={cn("border-t border-border flex items-center gap-1 shrink-0", isMobile ? "px-3 py-2" : "px-4 py-2")}>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleArchiveNote()} disabled={loading}>
                <Archive className="h-3.5 w-3.5" />
                {t("chat.notebook.archive")}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => selectedNote && handleShareNote(selectedNote)} disabled={loading}>
                <Share2 className="h-3.5 w-3.5" />
                {t("share.title")}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleAutoTag} disabled={autoTagging}>
                {autoTagging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {t("chat.notebook.autoTag")}
              </Button>
              <Button variant="ghost" size="sm" className={cn("h-7 text-xs gap-1", askAiOpen && "bg-accent")} onClick={() => setAskAiOpen(!askAiOpen)}>
                <Bot className="h-3.5 w-3.5" />
                {t("chat.notebook.askAi")}
              </Button>
            </div>
            {askAiOpen && (
              <div className="border-t border-border px-3 py-2 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={askAiQuestion}
                    onChange={(e) => setAskAiQuestion(e.target.value)}
                    placeholder={t("chat.notebook.askAiPlaceholder")}
                    className="flex-1 h-8 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && handleAskAi()}
                  />
                  <Button
                    size="sm"
                    className="h-8"
                    onClick={handleAskAi}
                    disabled={askAiLoading || !askAiQuestion.trim()}
                  >
                    {askAiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  </Button>
                </div>
                {askAiAnswer && (
                  <div className="rounded-md bg-muted/50 p-2 text-xs whitespace-pre-wrap">{askAiAnswer}</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Create View */}
        {viewMode === "create" && (
          <div className="flex flex-col h-full">
            <div className={cn("flex items-center gap-2 shrink-0", isMobile ? "px-2 pb-3" : "px-4 pt-4 pb-3 border-b")}>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h3 className="text-sm font-semibold flex-1">{t("chat.notebook.newNote")}</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className={cn("flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto", isMobile ? "px-3 py-2" : "px-4 py-3")}>
              <input type="text" placeholder={t("chat.notebook.titlePlaceholder")} value={titleInput} onChange={(e) => setTitleInput(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" autoFocus />
              {/* Tag Input */}
              <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 min-h-[32px]">
                {tagsInput.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-0.5 rounded-full bg-brand/10 text-brand-text px-2 py-0.5 text-[10px] font-medium">
                    {tag}
                    <button type="button" onClick={() => handleRemoveTag(tag)} className="ml-0.5 hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                  </span>
                ))}
                <input
                  type="text"
                  value={tagInputValue}
                  onChange={(e) => setTagInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); handleAddTag(tagInputValue); } }}
                  onBlur={() => { if (tagInputValue.trim()) handleAddTag(tagInputValue); }}
                  placeholder={tagsInput.length === 0 ? t("chat.notebook.addTag") : ""}
                  className="flex-1 min-w-[60px] bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                />
              </div>
              <NotebookEditor content={contentInput} onChange={setContentInput} editable placeholder={t("chat.notebook.contentPlaceholder")} className="flex-1 min-h-0 rounded-md border border-border bg-background" conversationId={conversationId} />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={handleBack}>{t("common.cancel")}</Button>
                <Button size="sm" onClick={handleCreate} disabled={loading || !titleInput.trim()}>
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  {t("chat.notebook.create")}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Edit View */}
        {viewMode === "edit" && selectedNote && (
          <div className="flex flex-col h-full">
            <div className={cn("flex items-center gap-2 shrink-0", isMobile ? "px-2 pb-3" : "px-4 pt-4 pb-3 border-b")}>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h3 className="text-sm font-semibold flex-1">{t("chat.notebook.editNote")}</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className={cn("flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto", isMobile ? "px-3 py-2" : "px-4 py-3")}>
              <input type="text" placeholder={t("chat.notebook.titlePlaceholder")} value={titleInput} onChange={(e) => setTitleInput(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" autoFocus />
              {/* Tag Input */}
              <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 min-h-[32px]">
                {tagsInput.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-0.5 rounded-full bg-brand/10 text-brand-text px-2 py-0.5 text-[10px] font-medium">
                    {tag}
                    <button type="button" onClick={() => handleRemoveTag(tag)} className="ml-0.5 hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                  </span>
                ))}
                <input
                  type="text"
                  value={tagInputValue}
                  onChange={(e) => setTagInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); handleAddTag(tagInputValue); } }}
                  onBlur={() => { if (tagInputValue.trim()) handleAddTag(tagInputValue); }}
                  placeholder={tagsInput.length === 0 ? t("chat.notebook.addTag") : ""}
                  className="flex-1 min-w-[60px] bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                />
              </div>
              <NotebookEditor content={contentInput} onChange={setContentInput} editable placeholder={t("chat.notebook.contentPlaceholder")} className="flex-1 min-h-0 rounded-md border border-border bg-background" conversationId={conversationId} />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={handleBack}>{t("common.cancel")}</Button>
                <Button size="sm" onClick={handleSave} disabled={loading || !titleInput.trim()}>
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  {t("common.save")}
                </Button>
              </div>
            </div>
          </div>
        )}

      </div>
      <ShareSheet open={shareSheetOpen} onOpenChange={setShareSheetOpen} content={shareContent} />
    </div>
  );

  if (inline) return panel;
  return typeof document !== "undefined" ? createPortal(panel, document.body) : null;
}
