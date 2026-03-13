"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import {
  BookOpen,
  Plus,
  ArrowLeft,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  FolderOpen,
  X,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import { NotebookSheet } from "./notebook-sheet";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

interface Notebook {
  id: string;
  ownerId: string;
  name: string;
  isDefault: boolean;
  sortOrder: number;
  noteCount: number;
  createdAt: string;
  updatedAt: string;
}

interface NotebookListProps {
  conversationId: string;
  inline?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function NotebookList({ conversationId, inline, open, onOpenChange }: NotebookListProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNotebook, setSelectedNotebook] = useState<Notebook | null>(() => {
    try {
      const saved = localStorage.getItem("arinova-last-notebook");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const fetchNotebooks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ notebooks: Notebook[] }>("/api/notebooks");
      setNotebooks(data.notebooks);
    } catch {
      // auto-handled
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotebooks();
  }, [fetchNotebooks]);

  // Persist selectedNotebook to localStorage
  useEffect(() => {
    if (selectedNotebook) {
      localStorage.setItem("arinova-last-notebook", JSON.stringify(selectedNotebook));
    } else {
      localStorage.removeItem("arinova-last-notebook");
    }
  }, [selectedNotebook]);

  // Auto-enter default notebook if only one exists
  useEffect(() => {
    if (!loading && notebooks.length === 1 && !selectedNotebook) {
      setSelectedNotebook(notebooks[0]);
    }
  }, [loading, notebooks, selectedNotebook]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await api<Notebook>("/api/notebooks", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNewName("");
      setCreating(false);
      fetchNotebooks();
    } catch {
      // auto-handled
    }
  };

  const handleRename = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    try {
      await api(`/api/notebooks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setEditingId(null);
      setEditName("");
      fetchNotebooks();
    } catch {
      // auto-handled
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/api/notebooks/${id}`, { method: "DELETE" });
      fetchNotebooks();
    } catch {
      // auto-handled
    }
  };

  // If a notebook is selected, show notes for that notebook
  if (selectedNotebook) {
    return (
      <NotebookNotes
        notebook={selectedNotebook}
        conversationId={conversationId}
        inline={inline}
        onBack={() => {
          setSelectedNotebook(null);
          fetchNotebooks(); // refresh counts
        }}
        onClose={!inline && onOpenChange ? () => onOpenChange(false) : undefined}
      />
    );
  }

  const content = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <BookOpen className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold flex-1">{t("notebooks.title")}</span>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          title={t("notebooks.create")}
        >
          <Plus className="h-4 w-4" />
        </button>
        {!inline && onOpenChange && (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors ml-1"
          >
            ✕
          </button>
        )}
      </div>

      {/* Create input */}
      {creating && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setCreating(false); setNewName(""); }
            }}
            placeholder={t("notebooks.namePlaceholder")}
            className="h-8 text-sm"
          />
          <button
            type="button"
            onClick={handleCreate}
            className="rounded-md px-2 py-1 text-xs font-medium bg-brand text-white hover:bg-brand/90 transition-colors"
          >
            {t("notebooks.add")}
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : notebooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
            <FolderOpen className="h-8 w-8 mb-2 opacity-50" />
            {t("notebooks.empty")}
          </div>
        ) : (
          notebooks.map((nb) => (
            <div key={nb.id} className="group">
              {editingId === nb.id ? (
                <div className="flex items-center gap-2 px-3 py-2">
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(nb.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-7 text-sm flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => handleRename(nb.id)}
                    className="text-xs font-medium text-brand"
                  >
                    {t("notebooks.save")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedNotebook(nb)}
                  className="flex items-center w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                >
                  <BookOpen className="h-4 w-4 text-muted-foreground mr-2.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {nb.name}
                      {nb.isDefault && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">
                          ({t("notebooks.default")})
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {nb.noteCount} {t("notebooks.noteCount")}
                    </div>
                  </div>

                  {/* Context menu */}
                  {!nb.isDefault && (
                    <Popover open={menuOpenId === nb.id} onOpenChange={(o) => setMenuOpenId(o ? nb.id : null)}>
                      <PopoverTrigger asChild>
                        <div
                          role="button"
                          onClick={(e) => { e.stopPropagation(); setMenuOpenId(nb.id); }}
                          className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="w-36 p-1" align="end" side="bottom">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(nb.id);
                            setEditName(nb.name);
                            setMenuOpenId(null);
                          }}
                        >
                          <Pencil className="h-3 w-3" /> {t("notebooks.rename")}
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(nb.id);
                            setMenuOpenId(null);
                          }}
                        >
                          <Trash2 className="h-3 w-3" /> {t("notebooks.delete")}
                        </button>
                      </PopoverContent>
                    </Popover>
                  )}
                </button>
              )}
            </div>
          ))
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

/** Notes list inside a specific notebook */
function NotebookNotes({
  notebook,
  conversationId,
  inline,
  onBack,
  onClose,
}: {
  notebook: Notebook;
  conversationId: string;
  inline?: boolean;
  onBack: () => void;
  onClose?: () => void;
}) {
  const { t } = useTranslation();

  const content = (
    <div className="flex flex-col h-full">
      {/* Breadcrumb header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-xs text-muted-foreground">{t("notebooks.title")}</span>
        <span className="text-xs text-muted-foreground">/</span>
        <span className="text-sm font-semibold truncate flex-1">{notebook.name}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors ml-auto"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Reuse existing NotebookSheet for note list rendering */}
      <div className="flex-1 min-h-0">
        <NotebookSheet
          inline
          open
          onOpenChange={onClose ? () => onClose() : () => {}}
          conversationId={conversationId}
          notebookId={notebook.id}
        />
      </div>
    </div>
  );

  return content;
}
