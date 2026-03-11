"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { SortableCard, CompactCard } from "./kanban-card";
import type { KanbanCard, KanbanColumn } from "./types";

// ── Full Column (with DnD) ──────────────────────────────────

export function FullColumn({
  column,
  cards,
  cardAgentsMap,
  agentEmojis,
  agentNames,
  onAddCard,
  onDeleteCard,
  onSelectCard,
}: {
  column: KanbanColumn;
  cards: KanbanCard[];
  cardAgentsMap: Map<string, string[]>;
  agentEmojis: Map<string, string>;
  agentNames: Map<string, string>;
  onAddCard: (columnId: string) => void;
  onDeleteCard: (id: string) => void;
  onSelectCard: (card: KanbanCard) => void;
}) {
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/30 md:w-80">
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{column.name}</h3>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            {cards.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onAddCard(column.id)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
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
}: {
  column: KanbanColumn;
  cards: KanbanCard[];
  allColumns: KanbanColumn[];
  onMoveCard: (cardId: string, targetColumnId: string) => void;
  onSelectCard: (card: KanbanCard) => void;
  onCreateCard: (columnId: string, title: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onCreateCard(column.id, title.trim());
    setTitle("");
    setAdding(false);
    setSaving(false);
  };

  return (
    <div className="flex flex-col w-64 shrink-0 rounded-lg bg-muted/30 p-2 max-h-full">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {column.name}
        </span>
        <span className="text-xs text-muted-foreground">{cards.length}</span>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto min-h-0">
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

      {/* Add card */}
      {adding ? (
        <div className="mt-2 space-y-1">
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
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-1 py-0.5"
        >
          <Plus className="h-3 w-3" />
          {t("chat.kanban.addCard")}
        </button>
      )}
    </div>
  );
}
