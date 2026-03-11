"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITY_CONFIG, PRIORITY_BORDER, type KanbanCard, type KanbanColumn } from "./types";

// ── Priority Badge ──────────────────────────────────────────

export function PriorityBadge({ priority }: { priority: string | null }) {
  const p = priority ?? "medium";
  const cfg = PRIORITY_CONFIG[p] ?? PRIORITY_CONFIG.medium;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

// ── Sortable Card (full mode) ───────────────────────────────

export function SortableCard({
  card,
  agents,
  agentEmojis,
  agentNames,
  onDelete,
  onSelect,
}: {
  card: KanbanCard;
  agents: string[];
  agentEmojis: Map<string, string>;
  agentNames: Map<string, string>;
  onDelete: (id: string) => void;
  onSelect: (card: KanbanCard) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", card },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative rounded-lg border border-border bg-card p-3 shadow-sm hover:border-border/80 transition-colors cursor-pointer"
      onClick={() => onSelect(card)}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground leading-snug">{card.title}</div>
          {card.description && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{card.description}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <PriorityBadge priority={card.priority} />
            {agents.length > 0 && (
              <div className="flex -space-x-1">
                {agents.map((aid) => (
                  <span
                    key={aid}
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-[10px] ring-1 ring-card"
                    title={agentNames.get(aid) ?? aid}
                  >
                    {agentEmojis.get(aid) ?? "\u{1F916}"}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}
          className="shrink-0 rounded p-1 text-muted-foreground/0 group-hover:text-muted-foreground hover:text-red-400 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Compact Card (compact / mobile mode) ────────────────────

export function CompactCard({
  card,
  columns,
  onMoveCard,
  onSelect,
}: {
  card: KanbanCard;
  columns: KanbanColumn[];
  onMoveCard: (cardId: string, targetColumnId: string) => void;
  onSelect: (card: KanbanCard) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(card)}
      onKeyDown={(e) => { if (e.key === "Enter") onSelect(card); }}
      className={cn(
        "rounded-md border border-border bg-card p-2 text-sm border-l-2 cursor-pointer hover:bg-accent/50 transition-colors",
        PRIORITY_BORDER[card.priority ?? "medium"] ?? "border-l-transparent"
      )}
    >
      <p className="font-medium truncate">{card.title}</p>
      {card.description && (
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{card.description}</p>
      )}
      {/* Move dropdown */}
      <select
        className="mt-1 w-full text-[10px] bg-transparent border border-border rounded px-1 py-0.5 text-muted-foreground"
        value={card.columnId}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onMoveCard(card.id, e.target.value)}
      >
        {columns.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}

// ── Drag Overlay Card ───────────────────────────────────────

export function CardOverlay({ card }: { card: KanbanCard }) {
  return (
    <div className="rounded-lg border border-brand/40 bg-card p-3 shadow-lg w-64">
      <div className="text-sm font-medium text-foreground">{card.title}</div>
      <div className="mt-1">
        <PriorityBadge priority={card.priority} />
      </div>
    </div>
  );
}
