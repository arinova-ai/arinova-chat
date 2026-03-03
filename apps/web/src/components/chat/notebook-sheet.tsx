"use client";

import { useState, useEffect, useCallback } from "react";
import type { Note } from "@arinova/shared/types";
import { createPortal } from "react-dom";
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
} from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { useTranslation } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";

interface NotebookSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
}

const EMPTY_NOTES: Note[] = [];

type ViewMode = "list" | "detail" | "edit" | "create";

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

export function NotebookSheet({ open, onOpenChange, conversationId }: NotebookSheetProps) {
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
  const currentUserId = useChatStore((s) => s.currentUserId);
  const agentNotesEnabled = useChatStore(
    (s) => s.agentNotesEnabledByConversation[conversationId] ?? true
  );
  const toggleAgentNotesEnabled = useChatStore((s) => s.toggleAgentNotesEnabled);

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [contentInput, setContentInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Load notes when sheet opens
  useEffect(() => {
    if (open && conversationId && !notesLoaded) {
      setLoading(true);
      loadNotes(conversationId).finally(() => {
        setLoading(false);
        setNotesLoaded(true);
      });
    }
  }, [open, conversationId, loadNotes, notesLoaded]);

  // Reset state when sheet closes
  useEffect(() => {
    if (!open) {
      setViewMode("list");
      setSelectedNote(null);
      setTitleInput("");
      setContentInput("");
      setSettingsOpen(false);
    }
  }, [open]);

  // Reset notesLoaded when conversation changes
  useEffect(() => {
    setNotesLoaded(false);
  }, [conversationId]);

  const handleOpenNote = useCallback((note: Note) => {
    setSelectedNote(note);
    setViewMode("detail");
  }, []);

  const handleStartCreate = useCallback(() => {
    setTitleInput("");
    setContentInput("");
    setViewMode("create");
  }, []);

  const handleStartEdit = useCallback(() => {
    if (!selectedNote) return;
    setTitleInput(selectedNote.title);
    setContentInput(selectedNote.content);
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
      const note = await createNote(conversationId, titleInput.trim(), contentInput);
      setSelectedNote(note);
      setViewMode("detail");
    } catch {
      // Error toast handled by api()
    } finally {
      setLoading(false);
    }
  }, [conversationId, titleInput, contentInput, createNote]);

  const handleSave = useCallback(async () => {
    if (!selectedNote || !titleInput.trim()) return;
    setLoading(true);
    try {
      await updateNote(conversationId, selectedNote.id, {
        title: titleInput.trim(),
        content: contentInput,
      });
      // Update local selectedNote to reflect changes
      setSelectedNote({
        ...selectedNote,
        title: titleInput.trim(),
        content: contentInput,
        updatedAt: new Date().toISOString(),
      });
      setViewMode("detail");
    } catch {
      // Error toast handled by api()
    } finally {
      setLoading(false);
    }
  }, [selectedNote, conversationId, titleInput, contentInput, updateNote]);

  const handleDelete = useCallback(async () => {
    if (!selectedNote) return;
    setLoading(true);
    try {
      await deleteNote(conversationId, selectedNote.id);
      setSelectedNote(null);
      setViewMode("list");
    } catch {
      // Error toast handled by api()
    } finally {
      setLoading(false);
    }
  }, [selectedNote, conversationId, deleteNote]);

  const handleToggleAgentNotes = useCallback(
    (checked: boolean) => {
      toggleAgentNotesEnabled(conversationId, checked);
    },
    [conversationId, toggleAgentNotesEnabled]
  );

  const canEdit = selectedNote && selectedNote.creatorId === currentUserId;

  if (!open) return null;

  const panel = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 animate-in fade-in-0"
        onClick={() => onOpenChange(false)}
      />
      {/* Panel */}
      <div
        className={cn(
          "fixed z-50 shadow-lg animate-in",
          isMobile
            ? "inset-x-0 bottom-0 rounded-t-2xl border-border bg-secondary px-2 pb-6 pt-3 max-h-[80vh] slide-in-from-bottom"
            : "inset-y-0 right-0 w-full sm:w-[380px] sm:max-w-[380px] p-0 flex flex-col bg-secondary border-l border-border slide-in-from-right"
        )}
      >
        {/* Mobile drag handle */}
        {isMobile && (
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
        )}

        {/* List View */}
        {viewMode === "list" && (
          <div className={cn(!isMobile && "flex flex-col h-full")}>
            <div className={cn(
              isMobile ? "px-2 pb-3" : "px-4 pt-4 pb-3 border-b shrink-0"
            )}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4" />
                  {t("chat.notebook.title")}
                </h3>
                <div className="flex items-center gap-1">
                  {/* Settings popover */}
                  <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={t("chat.notebook.settings")}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="w-64 p-3"
                      side={isMobile ? "top" : "left"}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <label
                          htmlFor="agent-notes-toggle"
                          className="text-xs font-medium leading-tight cursor-pointer select-none flex-1"
                        >
                          {t("chat.notebook.agentAccess")}
                        </label>
                        <Switch
                          id="agent-notes-toggle"
                          checked={agentNotesEnabled}
                          onCheckedChange={handleToggleAgentNotes}
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleStartCreate}
                    title={t("chat.notebook.create")}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  {/* Desktop close button */}
                  {!isMobile && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onOpenChange(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className={cn("overflow-y-auto", isMobile ? "max-h-[65vh] px-1" : "flex-1 min-h-0 px-1")}>
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
                    <button
                      key={note.id}
                      type="button"
                      className="flex flex-col gap-1 rounded-lg px-3 py-2.5 text-left active:bg-accent hover:bg-accent/60 transition-colors"
                      onClick={() => handleOpenNote(note)}
                    >
                      <p className="text-sm font-semibold truncate">
                        {note.title || t("common.untitled")}
                      </p>
                      {note.content && (
                        <p className="text-xs text-muted-foreground line-clamp-2 break-words">
                          {note.content}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{note.creatorName}</span>
                        <span>&middot;</span>
                        <span suppressHydrationWarning>{formatTime(note.updatedAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Detail View */}
        {viewMode === "detail" && selectedNote && (
          <div className={cn(!isMobile && "flex flex-col h-full")}>
            <div className={cn(
              "flex items-center gap-2",
              isMobile ? "px-2 pb-3" : "px-4 pt-4 pb-3 border-b shrink-0"
            )}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleBack}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h3 className="text-sm font-semibold truncate flex-1">
                {selectedNote.title || t("common.untitled")}
              </h3>
              <div className="flex items-center gap-1">
                {canEdit && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleStartEdit}
                      title={t("chat.notebook.edit")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={handleDelete}
                      disabled={loading}
                      title={t("common.delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                {!isMobile && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onOpenChange(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className={cn("overflow-y-auto", isMobile ? "max-h-[65vh] px-3" : "flex-1 min-h-0 px-4 py-3")}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                <span>{selectedNote.creatorName}</span>
                <span>&middot;</span>
                <span suppressHydrationWarning>{formatTime(selectedNote.updatedAt)}</span>
              </div>
              {selectedNote.content ? (
                <NotebookEditor
                  content={selectedNote.content}
                  editable={false}
                />
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  {t("chat.notebook.noContent")}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Create View */}
        {viewMode === "create" && (
          <div className={cn(!isMobile && "flex flex-col h-full")}>
            <div className={cn(
              "flex items-center gap-2",
              isMobile ? "px-2 pb-3" : "px-4 pt-4 pb-3 border-b shrink-0"
            )}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleBack}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h3 className="text-sm font-semibold flex-1">
                {t("chat.notebook.newNote")}
              </h3>
              {!isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onOpenChange(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className={cn(
              "flex flex-col gap-3 overflow-y-auto",
              isMobile ? "px-3 max-h-[65vh]" : "px-4 py-3 flex-1 min-h-0"
            )}>
              <input
                type="text"
                placeholder={t("chat.notebook.titlePlaceholder")}
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
              <NotebookEditor
                content={contentInput}
                onChange={setContentInput}
                editable
                placeholder={t("chat.notebook.contentPlaceholder")}
                className="flex-1 min-h-0 rounded-md border border-border bg-background"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={loading || !titleInput.trim()}
                >
                  {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : null}
                  {t("chat.notebook.create")}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Edit View */}
        {viewMode === "edit" && selectedNote && (
          <div className={cn(!isMobile && "flex flex-col h-full")}>
            <div className={cn(
              "flex items-center gap-2",
              isMobile ? "px-2 pb-3" : "px-4 pt-4 pb-3 border-b shrink-0"
            )}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleBack}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h3 className="text-sm font-semibold flex-1">
                {t("chat.notebook.editNote")}
              </h3>
              {!isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onOpenChange(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className={cn(
              "flex flex-col gap-3 overflow-y-auto",
              isMobile ? "px-3 max-h-[65vh]" : "px-4 py-3 flex-1 min-h-0"
            )}>
              <input
                type="text"
                placeholder={t("chat.notebook.titlePlaceholder")}
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
              <NotebookEditor
                content={contentInput}
                onChange={setContentInput}
                editable
                placeholder={t("chat.notebook.contentPlaceholder")}
                className="flex-1 min-h-0 rounded-md border border-border bg-background"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={loading || !titleInput.trim()}
                >
                  {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : null}
                  {t("common.save")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );

  return typeof document !== "undefined" ? createPortal(panel, document.body) : null;
}
