"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n";
import { SortableCard, CompactCard } from "./kanban-card";
import type { KanbanCard, KanbanColumn } from "./types";

// ── Full Column (with DnD + column menu) ──────────────────────

export function FullColumn({
  column,
  cards,
  allColumns,
  cardAgentsMap,
  agentEmojis,
  agentNames,
  onAddCard,
  onDeleteCard,
  onSelectCard,
  onRenameColumn,
  onDeleteColumn,
}: {
  column: KanbanColumn;
  cards: KanbanCard[];
  allColumns: KanbanColumn[];
  cardAgentsMap: Map<string, string[]>;
  agentEmojis: Map<string, string>;
  agentNames: Map<string, string>;
  onAddCard: (columnId: string) => void;
  onDeleteCard: (id: string) => void;
  onSelectCard: (card: KanbanCard) => void;
  onRenameColumn?: (columnId: string, name: string) => void;
  onDeleteColumn?: (columnId: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(column.name);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  const hasCards = cards.length > 0;

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue.trim() !== column.name) {
      onRenameColumn?.(column.id, renameValue.trim());
    }
    setRenaming(false);
  };

  const handleDeleteConfirm = () => {
    onDeleteColumn?.(column.id);
    setDeleteOpen(false);
  };

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/30 md:w-80">
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {renaming ? (
            <Input
              ref={renameRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="h-6 text-sm font-semibold px-1"
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit();
                if (e.key === "Escape") { setRenaming(false); setRenameValue(column.name); }
              }}
            />
          ) : (
            <h3
              className="text-sm font-semibold text-foreground truncate cursor-default"
              onDoubleClick={() => { setRenameValue(column.name); setRenaming(true); }}
            >
              {column.name}
            </h3>
          )}
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground shrink-0">
            {cards.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setRenameValue(column.name); setRenaming(true); }}>
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={() => onAddCard(column.id)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[60px]">
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              agents={cardAgentsMap.get(card.id) ?? []}
              agentEmojis={agentEmojis}
              agentNames={agentNames}
              onDelete={onDeleteCard}
              onSelect={onSelectCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground/60">No cards</p>
        )}
      </div>

      {/* Delete Column Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete column &quot;{column.name}&quot;</DialogTitle>
            <DialogDescription>
              {hasCards
                ? "This column has cards. Move or archive all cards before deleting."
                : "This column has no cards and will be deleted."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={hasCards}>
              Delete column
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Compact Column (no DnD, with inline add + move dropdown) ─

export function CompactColumn({
  column,
  cards,
  allColumns,
  onMoveCard,
  onSelectCard,
  onCreateCard,
  onRenameColumn,
  onDeleteColumn,
}: {
  column: KanbanColumn;
  cards: KanbanCard[];
  allColumns: KanbanColumn[];
  onMoveCard: (cardId: string, targetColumnId: string) => void;
  onSelectCard: (card: KanbanCard) => void;
  onCreateCard: (columnId: string, title: string) => Promise<void>;
  onRenameColumn?: (columnId: string, name: string) => void;
  onDeleteColumn?: (columnId: string) => void;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(column.name);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onCreateCard(column.id, title.trim());
    setTitle("");
    setAdding(false);
    setSaving(false);
  };

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue.trim() !== column.name) {
      onRenameColumn?.(column.id, renameValue.trim());
    }
    setRenaming(false);
  };

  const hasCards = cards.length > 0;

  return (
    <div className="flex flex-col w-64 shrink-0 rounded-lg bg-muted/30 p-2 max-h-full">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {renaming ? (
            <Input
              ref={renameRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="h-5 text-xs font-semibold px-1"
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit();
                if (e.key === "Escape") { setRenaming(false); setRenameValue(column.name); }
              }}
            />
          ) : (
            <span
              className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate cursor-default"
              onDoubleClick={() => { setRenameValue(column.name); setRenaming(true); }}
            >
              {column.name}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground shrink-0">{cards.length}</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setRenameValue(column.name); setRenaming(true); }}>
                <Pencil className="h-3 w-3 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDeleteColumn?.(column.id)}
                disabled={hasCards}
                className="text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-1.5 overflow-y-auto min-h-0 max-h-[calc(100vh-7rem)]">
        {cards.map((card) => (
          <CompactCard
            key={card.id}
            card={card}
            columns={allColumns}
            onMoveCard={onMoveCard}
            onSelect={onSelectCard}
          />
        ))}
      </div>

      {/* Inline add card form */}
      {adding && (
        <div className="mt-2 space-y-1 shrink-0">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("chat.kanban.newCardPlaceholder")}
            className="h-7 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setAdding(false); setTitle(""); }
            }}
          />
          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-xs flex-1" onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : t("common.add")}
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setAdding(false); setTitle(""); }}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
