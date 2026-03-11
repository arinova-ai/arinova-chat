"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Archive,
  Loader2,
  FileText,
  Search,
  Share2,
  Link,
  XCircle,
  Check,
  X,
  GitCommitHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { ShareSheet, type ShareContent } from "@/components/chat/share-sheet";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

// ── Types ─────────────────────────────────────────────────────

export interface KanbanCardData {
  id: string;
  columnId: string;
  title: string;
  description: string | null;
  priority: string | null;
  dueDate: string | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt?: string | null;
  shareToken?: string | null;
  isPublic?: boolean;
}

// ── Priority helpers ──────────────────────────────────────────

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: "Low", color: "text-slate-400", bg: "bg-slate-500/15" },
  medium: { label: "Medium", color: "text-blue-400", bg: "bg-blue-500/15" },
  high: { label: "High", color: "text-orange-400", bg: "bg-orange-500/15" },
  urgent: { label: "Urgent", color: "text-red-400", bg: "bg-red-500/15" },
};

function PriorityBadge({ priority }: { priority: string | null }) {
  const p = priority ?? "medium";
  const cfg = PRIORITY_CONFIG[p] ?? PRIORITY_CONFIG.medium;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

// ── Props ─────────────────────────────────────────────────────

export interface CardCommitData {
  cardId: string;
  commitHash: string;
  message?: string | null;
  createdAt?: string | null;
}

interface CardDetailSheetProps {
  card: KanbanCardData | null;
  onClose: () => void;
  onUpdate: () => void;
  onDelete?: (cardId: string) => void;
  cardAgents?: string[];
  cardNotes?: Array<{ noteId: string; noteTitle: string }>;
  cardCommits?: CardCommitData[];
  agentEmojis?: Map<string, string>;
  agentNames?: Map<string, string>;
}

// ── Component ─────────────────────────────────────────────────

export function CardDetailSheet({
  card,
  onClose,
  onUpdate,
  onDelete,
  cardAgents = [],
  cardNotes = [],
  cardCommits = [],
  agentEmojis = new Map(),
  agentNames = new Map(),
}: CardDetailSheetProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [saving, setSaving] = useState(false);
  const [linkingNote, setLinkingNote] = useState(false);
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
  const [availableNotes, setAvailableNotes] = useState<Array<{ id: string; title: string; tags: string[] }>>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [sharingLoading, setSharingLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [shareContent, setShareContent] = useState<ShareContent | null>(null);
  const [addingCommit, setAddingCommit] = useState(false);
  const [commitHash, setCommitHash] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [commitSaving, setCommitSaving] = useState(false);
  const [localCommits, setLocalCommits] = useState<CardCommitData[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { t } = useTranslation();

  // Fetch commits from the per-card endpoint on mount / card change
  const fetchCommits = useCallback(async (cardId: string) => {
    try {
      const data = await api<CardCommitData[]>(
        `/api/kanban/cards/${cardId}/commits`,
        { silent: true },
      );
      setLocalCommits(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (card) {
      fetchCommits(card.id);
    } else {
      setLocalCommits([]);
    }
  }, [card, fetchCommits]);

  // Merge: prefer localCommits (fetched per-card) over board-level prop
  const mergedCommits = localCommits.length > 0 ? localCommits : cardCommits;

  // Sync local state when card changes
  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDescription(card.description ?? "");
      setPriority(card.priority ?? "medium");
      setEditing(false);
      setLinkCopied(false);
      setConfirmDelete(false);
    }
  }, [card]);

  // Fetch available notes when opening the note selector
  const fetchAvailableNotes = useCallback(async (search?: string) => {
    setNotesLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      params.set("limit", "20");
      const notes = await api<Array<{ id: string; title: string; tags: string[] }>>(
        `/api/kanban/owner-notes?${params}`,
        { silent: true },
      );
      setAvailableNotes(notes);
    } catch { /* ignore */ }
    setNotesLoading(false);
  }, []);

  useEffect(() => {
    if (linkingNote) {
      fetchAvailableNotes();
    }
  }, [linkingNote, fetchAvailableNotes]);

  useEffect(() => {
    if (!linkingNote) return;
    const timer = setTimeout(() => {
      fetchAvailableNotes(noteSearchQuery || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [noteSearchQuery, linkingNote, fetchAvailableNotes]);

  const handleLinkNote = async (noteId: string) => {
    if (!card) return;
    try {
      await api(`/api/kanban/cards/${card.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ noteId }),
        silent: true,
      });
      setLinkingNote(false);
      setNoteSearchQuery("");
      onUpdate();
    } catch { /* api shows toast */ }
  };

  const handleUnlinkNote = async (noteId: string) => {
    if (!card) return;
    try {
      await api(`/api/kanban/cards/${card.id}/notes/${noteId}`, {
        method: "DELETE",
        silent: true,
      });
      onUpdate();
    } catch { /* api shows toast */ }
  };

  const handleArchive = async () => {
    if (!card) return;
    setArchiving(true);
    try {
      await api(`/api/kanban/cards/${card.id}/archive`, {
        method: "POST",
        silent: true,
      });
      onClose();
      onUpdate();
    } catch { /* api shows toast */ }
    setArchiving(false);
  };

  const handleStopSharing = async () => {
    if (!card) return;
    setSharingLoading(true);
    try {
      await api(`/api/kanban/cards/${card.id}/public-share`, { method: "DELETE" });
      onUpdate();
      card.shareToken = null;
      card.isPublic = false;
    } catch { /* api shows toast */ }
    setSharingLoading(false);
  };

  const handleCopyLink = () => {
    if (!card?.shareToken) return;
    const url = `${window.location.origin}/shared/cards/${card.shareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const handleShareCard = () => {
    if (!card) return;
    const text = `📋 ${card.title}${card.priority ? `\nPriority: ${card.priority}` : ""}${card.description ? `\n${card.description.slice(0, 200)}` : ""}`;
    setShareContent({
      type: "task",
      title: card.title,
      text,
      cardId: card.id,
    });
    setShareSheetOpen(true);
  };

  const handleDelete = async () => {
    if (!card) return;
    if (onDelete) {
      onDelete(card.id);
      onClose();
      return;
    }
    setDeleting(true);
    try {
      await api(`/api/kanban/cards/${card.id}`, { method: "DELETE", silent: true });
      onClose();
      onUpdate();
    } catch { /* api shows toast */ }
    setDeleting(false);
  };

  const handleAddCommit = async () => {
    if (!card || !commitHash.trim()) return;
    setCommitSaving(true);
    try {
      await api(`/api/kanban/cards/${card.id}/commits`, {
        method: "POST",
        body: JSON.stringify({
          commitHash: commitHash.trim(),
          message: commitMessage.trim() || undefined,
        }),
        silent: true,
      });
      setCommitHash("");
      setCommitMessage("");
      setAddingCommit(false);
      fetchCommits(card.id);
      onUpdate();
    } catch { /* api shows toast */ }
    setCommitSaving(false);
  };

  const handleDeleteCommit = async (hash: string) => {
    if (!card) return;
    try {
      await api(`/api/kanban/cards/${card.id}/commits/${encodeURIComponent(hash)}`, {
        method: "DELETE",
        silent: true,
      });
      fetchCommits(card.id);
      onUpdate();
    } catch { /* api shows toast */ }
  };

  const handleSave = async () => {
    if (!card || !title.trim()) return;
    setSaving(true);
    try {
      await api(`/api/kanban/cards/${card.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          priority,
        }),
        silent: true,
      });
      setEditing(false);
      onUpdate();
    } catch { /* api shows toast */ }
    setSaving(false);
  };

  return (
    <>
    <Sheet open={card !== null} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-80 sm:w-96 border-border bg-background">
        <SheetHeader>
          <SheetTitle>{editing ? "Edit Card" : "Card Details"}</SheetTitle>
          <SheetDescription className="sr-only">View and edit kanban card details</SheetDescription>
        </SheetHeader>

        {card && (
          <div className="mt-4 space-y-4 px-1">
            {editing ? (
              <>
                {/* Editable title */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Title *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                    autoFocus
                  />
                </div>

                {/* Editable description */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={5}
                    className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand resize-none"
                  />
                </div>

                {/* Editable priority */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Priority</label>
                  <div className="mt-1 flex gap-1.5">
                    {(["low", "medium", "high", "urgent"] as const).map((p) => {
                      const cfg = PRIORITY_CONFIG[p];
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriority(p)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            priority === p
                              ? `${cfg.bg} ${cfg.color} ring-1 ring-current`
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Save / Cancel */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!title.trim() || saving}
                    className="flex-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTitle(card.title);
                      setDescription(card.description ?? "");
                      setPriority(card.priority ?? "medium");
                      setEditing(false);
                    }}
                    className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Read-only title */}
                <div>
                  <h3 className="text-base font-semibold text-foreground">{card.title}</h3>
                </div>

                {/* Priority */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Priority</label>
                  <div className="mt-1">
                    <PriorityBadge priority={card.priority} />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Description</label>
                  {card.description ? (
                    <div className="mt-1 text-sm text-foreground prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-code:text-foreground prose-pre:bg-muted">
                      <ReactMarkdown>{card.description}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">No description.</p>
                  )}
                </div>

                {/* Assigned agents */}
                {cardAgents.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Assigned Agents</label>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {cardAgents.map((aid) => (
                        <span
                          key={aid}
                          className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                        >
                          <span>{agentEmojis.get(aid) ?? "\u{1F916}"}</span>
                          <span className="truncate max-w-[120px]">{agentNames.get(aid) ?? aid}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Linked Notes */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">Linked Notes</label>
                    <button
                      type="button"
                      onClick={() => setLinkingNote(!linkingNote)}
                      className="text-xs text-brand hover:text-brand/80"
                    >
                      {linkingNote ? "Cancel" : "+ Link Note"}
                    </button>
                  </div>
                  {linkingNote && (
                    <div className="mt-1.5 space-y-1.5">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Search notes..."
                          value={noteSearchQuery}
                          onChange={(e) => setNoteSearchQuery(e.target.value)}
                          className="w-full rounded-lg border border-border bg-muted/50 pl-7 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-muted/30">
                        {notesLoading ? (
                          <div className="flex items-center justify-center py-3">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          </div>
                        ) : availableNotes.length === 0 ? (
                          <p className="py-3 text-center text-[11px] text-muted-foreground">No notes found</p>
                        ) : (
                          availableNotes
                            .filter((n) => !cardNotes.some((cn) => cn.noteId === n.id))
                            .map((note) => (
                              <button
                                key={note.id}
                                type="button"
                                onClick={() => handleLinkNote(note.id)}
                                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent transition-colors"
                              >
                                <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="flex-1 truncate text-foreground">{note.title || "Untitled"}</span>
                              </button>
                            ))
                        )}
                      </div>
                    </div>
                  )}
                  {cardNotes.length > 0 ? (
                    <div className="mt-1.5 space-y-1">
                      {cardNotes.map((cn) => (
                        <div
                          key={cn.noteId}
                          className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs"
                        >
                          <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate text-foreground">{cn.noteTitle}</span>
                          <button
                            type="button"
                            onClick={() => handleUnlinkNote(cn.noteId)}
                            className="text-muted-foreground hover:text-red-400 shrink-0"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">No linked notes.</p>
                  )}
                </div>

                {/* Commits */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">Commits</label>
                    <button
                      type="button"
                      onClick={() => setAddingCommit(!addingCommit)}
                      className="text-xs text-brand hover:text-brand/80"
                    >
                      {addingCommit ? "Cancel" : "+ Add Commit"}
                    </button>
                  </div>
                  {addingCommit && (
                    <div className="mt-1.5 space-y-1.5">
                      <input
                        type="text"
                        placeholder="Commit hash..."
                        value={commitHash}
                        onChange={(e) => setCommitHash(e.target.value)}
                        className="w-full rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                        autoFocus
                        maxLength={40}
                      />
                      <input
                        type="text"
                        placeholder="Message (optional)..."
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        className="w-full rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddCommit(); }}
                      />
                      <button
                        type="button"
                        onClick={handleAddCommit}
                        disabled={!commitHash.trim() || commitSaving}
                        className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                      >
                        {commitSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Add
                      </button>
                    </div>
                  )}
                  {mergedCommits.length > 0 ? (
                    <div className="mt-1.5 space-y-1">
                      {mergedCommits.map((c) => (
                        <div
                          key={c.commitHash}
                          className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs"
                        >
                          <GitCommitHorizontal className="h-3 w-3 text-muted-foreground shrink-0" />
                          <code className="font-mono text-foreground shrink-0">{c.commitHash.slice(0, 7)}</code>
                          {c.message && (
                            <span className="flex-1 truncate text-muted-foreground">{c.message}</span>
                          )}
                          {!c.message && <span className="flex-1" />}
                          <button
                            type="button"
                            onClick={() => handleDeleteCommit(c.commitHash)}
                            className="text-muted-foreground hover:text-red-400 shrink-0"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">No linked commits.</p>
                  )}
                </div>

                {/* Timestamps */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Created: {formatTime(card.createdAt)}</span>
                  </div>
                  {card.updatedAt && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Updated: {formatTime(card.updatedAt)}</span>
                    </div>
                  )}
                </div>

                {/* Sharing controls */}
                <div className="space-y-2">
                  {card.shareToken ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="flex items-center gap-1 rounded-md border border-border/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      >
                        {linkCopied ? (
                          <>
                            <Check className="h-3 w-3 text-green-500" />
                            {t("kanban.share.linkCopied")}
                          </>
                        ) : (
                          <>
                            <Link className="h-3 w-3" />
                            {t("kanban.share.copyLink")}
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
                        {t("kanban.share.stopSharing")}
                      </button>
                    </div>
                  ) : null}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90"
                  >
                    Edit Card
                  </button>
                  <button
                    type="button"
                    onClick={handleArchive}
                    disabled={archiving}
                    className="rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
                    title="Archive card"
                  >
                    <Archive className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleShareCard}
                    className="rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
                    title={t("kanban.share.title")}
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                  {confirmDelete ? (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded-lg border border-red-500 px-3 py-2.5 text-sm text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                      title="Confirm delete"
                    >
                      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-red-500/50 hover:text-red-500"
                      title="Delete card"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>

    <ShareSheet
      open={shareSheetOpen}
      onOpenChange={setShareSheetOpen}
      content={shareContent}
    />
    </>
  );
}
