"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, GripVertical, Trash2, X, Clock, Archive, RotateCcw, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { CardDetailSheet } from "@/components/kanban/card-detail-sheet";
import { useOfficeStream } from "@/hooks/use-office-stream";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

// ── Types ─────────────────────────────────────────────────────

interface KanbanColumn {
  id: string;
  boardId: string;
  name: string;
  sortOrder: number;
}

interface KanbanCard {
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

interface CardAgent {
  cardId: string;
  agentId: string;
}

interface CardNote {
  cardId: string;
  noteId: string;
  noteTitle: string;
}

interface CardCommit {
  cardId: string;
  commitHash: string;
  message?: string | null;
  createdAt?: string | null;
}

interface BoardData {
  id: string;
  columns: KanbanColumn[];
  cards: KanbanCard[];
  cardAgents: CardAgent[];
  cardNotes: CardNote[];
  cardCommits: CardCommit[];
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
    return iso;
  }
}

// ── Sortable Card ─────────────────────────────────────────────

function SortableCard({
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

// ── Drag overlay card (non-interactive visual copy) ───────────

function CardOverlay({ card }: { card: KanbanCard }) {
  return (
    <div className="rounded-lg border border-brand/40 bg-card p-3 shadow-lg w-64">
      <div className="text-sm font-medium text-foreground">{card.title}</div>
      <div className="mt-1">
        <PriorityBadge priority={card.priority} />
      </div>
    </div>
  );
}


// ── Column ────────────────────────────────────────────────────

function KanbanColumnView({
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

// ── Add Card Sheet ────────────────────────────────────────────

function AddCardSheet({
  open,
  onClose,
  onSubmit,
  streamAgents,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; description: string; priority: string; agentIds: string[] }) => void;
  streamAgents: { id: string; name: string; emoji: string }[];
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), description: description.trim(), priority, agentIds: [...selectedAgents] });
    setTitle("");
    setDescription("");
    setPriority("medium");
    setSelectedAgents(new Set());
  };

  const toggleAgent = (id: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-80 sm:w-96 border-border bg-background">
        <SheetHeader>
          <SheetTitle>New Card</SheetTitle>
          <SheetDescription className="sr-only">Create a new kanban card</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 px-1">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title..."
              className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details..."
              rows={3}
              className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand resize-none"
            />
          </div>

          {/* Priority */}
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

          {/* Assign Agents */}
          {streamAgents.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Assign Agents</label>
              <div className="mt-1 space-y-1">
                {streamAgents.filter((a) => a.id && !a.id.startsWith("empty-")).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAgent(a.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                      selectedAgents.has(a.id)
                        ? "bg-brand/15 text-brand-text"
                        : "text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <span className="text-base">{a.emoji}</span>
                    <span className="flex-1 truncate">{a.name}</span>
                    {selectedAgents.has(a.id) && <span className="text-brand-text text-xs">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Card
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Archived Cards Sheet ──────────────────────────────────────

interface ArchivedCard {
  id: string;
  title: string;
  description: string | null;
  priority: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  archivedAt: string | null;
}

interface ArchivedResponse {
  cards: ArchivedCard[];
  total: number;
  page: number;
  limit: number;
}

function ArchivedCardsSheet({
  open,
  boardId,
  onClose,
  onUnarchived,
}: {
  open: boolean;
  boardId: string;
  onClose: () => void;
  onUnarchived: () => void;
}) {
  const [data, setData] = useState<ArchivedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [unarchivingId, setUnarchivingId] = useState<string | null>(null);
  const limit = 20;

  const fetchArchived = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await api<ArchivedResponse>(
        `/api/kanban/boards/${boardId}/archived-cards?page=${p}&limit=${limit}`,
        { silent: true },
      );
      setData(res);
      setPage(p);
    } catch { /* ignore */ }
    setLoading(false);
  }, [boardId]);

  useEffect(() => {
    if (open) fetchArchived(1);
  }, [open, fetchArchived]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

  const handleUnarchive = async (cardId: string) => {
    setUnarchivingId(cardId);
    try {
      await api(`/api/kanban/cards/${cardId}/unarchive`, { method: "POST", silent: true });
      onUnarchived();
      await fetchArchived(page);
    } catch { /* ignore */ }
    setUnarchivingId(null);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-80 sm:w-96 border-border bg-background">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Archived Cards
          </SheetTitle>
          <SheetDescription className="sr-only">View and restore archived kanban cards</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2 px-1">
          {loading && !data ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !data || data.cards.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No archived cards</p>
          ) : (
            <>
              {data.cards.map((card) => (
                <div
                  key={card.id}
                  className="rounded-lg border border-border bg-card p-3 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{card.title}</p>
                      {card.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{card.description}</p>
                      )}
                    </div>
                    <PriorityBadge priority={card.priority} />
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    {card.updatedAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Done: {formatTime(card.updatedAt)}
                      </span>
                    )}
                    {card.archivedAt && (
                      <span>Archived: {formatTime(card.archivedAt)}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnarchive(card.id)}
                    disabled={unarchivingId === card.id}
                    className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-brand-text hover:bg-brand/10 transition-colors disabled:opacity-50"
                  >
                    {unarchivingId === card.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    Unarchive
                  </button>
                </div>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => fetchArchived(page - 1)}
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages || loading}
                    onClick={() => fetchArchived(page + 1)}
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              <p className="text-center text-[11px] text-muted-foreground">
                {data.total} archived card{data.total !== 1 ? "s" : ""}
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main page ─────────────────────────────────────────────────

export default function OfficeTasksPage() {
  const stream = useOfficeStream();
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [addColumnId, setAddColumnId] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const agentEmojis = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of stream.agents) {
      if (a.id && a.emoji) map.set(a.id, a.emoji);
    }
    return map;
  }, [stream.agents]);

  const agentNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of stream.agents) {
      if (a.id && a.name) map.set(a.id, a.name);
    }
    return map;
  }, [stream.agents]);

  const streamAgentsList = useMemo(
    () => stream.agents.filter((a) => a.id && !a.id.startsWith("empty-")).map((a) => ({
      id: a.id,
      name: a.name,
      emoji: a.emoji,
    })),
    [stream.agents],
  );

  // Fetch board data
  const fetchBoard = useCallback(async () => {
    try {
      const boards = await api<{ id: string }[]>("/api/kanban/boards", { silent: true });
      if (boards.length === 0) return;
      const data = await api<BoardData>(`/api/kanban/boards/${boards[0].id}`, { silent: true });
      setBoard(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // Derived data
  const columns = useMemo(
    () => (board?.columns ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [board],
  );

  const cardsByColumn = useMemo(() => {
    const map = new Map<string, KanbanCard[]>();
    for (const col of columns) map.set(col.id, []);
    for (const card of board?.cards ?? []) {
      const list = map.get(card.columnId);
      if (list) list.push(card);
    }
    // Sort each column's cards
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [board, columns]);

  const cardAgentsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const ca of board?.cardAgents ?? []) {
      const arr = map.get(ca.cardId) ?? [];
      arr.push(ca.agentId);
      map.set(ca.cardId, arr);
    }
    return map;
  }, [board]);

  const cardNotesMap = useMemo(() => {
    const map = new Map<string, Array<{ noteId: string; noteTitle: string }>>();
    for (const cn of board?.cardNotes ?? []) {
      const arr = map.get(cn.cardId) ?? [];
      arr.push({ noteId: cn.noteId, noteTitle: cn.noteTitle });
      map.set(cn.cardId, arr);
    }
    return map;
  }, [board]);

  const cardCommitsMap = useMemo(() => {
    const map = new Map<string, CardCommit[]>();
    for (const cc of board?.cardCommits ?? []) {
      const arr = map.get(cc.cardId) ?? [];
      arr.push(cc);
      map.set(cc.cardId, arr);
    }
    return map;
  }, [board]);

  // Find card by id across all columns
  const findCard = useCallback(
    (id: string) => board?.cards.find((c) => c.id === id) ?? null,
    [board],
  );

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const card = findCard(event.active.id as string);
      setActiveCard(card);
    },
    [findCard],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over || !board) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      // Find which column the active card is in
      const activeCard = board.cards.find((c) => c.id === activeId);
      if (!activeCard) return;

      // Determine target column: if overId is a card, use that card's column; if it's a column id, use that
      let targetColumnId: string | null = null;
      const overCard = board.cards.find((c) => c.id === overId);
      if (overCard) {
        targetColumnId = overCard.columnId;
      } else if (columns.some((col) => col.id === overId)) {
        targetColumnId = overId;
      }

      if (!targetColumnId || activeCard.columnId === targetColumnId) return;

      // Move card to new column (optimistic)
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          cards: prev.cards.map((c) =>
            c.id === activeId ? { ...c, columnId: targetColumnId! } : c,
          ),
        };
      });
    },
    [board, columns],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveCard(null);
      const { active, over } = event;
      if (!over || !board) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      const activeCard = board.cards.find((c) => c.id === activeId);
      if (!activeCard) return;

      // Determine the target column
      let targetColumnId = activeCard.columnId;
      const overCard = board.cards.find((c) => c.id === overId);
      if (overCard) targetColumnId = overCard.columnId;
      else if (columns.some((col) => col.id === overId)) targetColumnId = overId;

      // Calculate new sort order
      const colCards = board.cards
        .filter((c) => c.columnId === targetColumnId && c.id !== activeId)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      let newOrder = 0;
      if (overCard && overCard.id !== activeId) {
        const overIdx = colCards.findIndex((c) => c.id === overId);
        if (overIdx >= 0) {
          // Insert after the over card
          newOrder = overIdx + 1;
          // Reindex
          const reindexed = [...colCards];
          reindexed.splice(newOrder, 0, { ...activeCard, columnId: targetColumnId });
          setBoard((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              cards: prev.cards.map((c) => {
                const idx = reindexed.findIndex((r) => r.id === c.id);
                if (idx >= 0) return { ...c, columnId: targetColumnId, sortOrder: idx };
                return c;
              }),
            };
          });
          newOrder = newOrder; // for API
        }
      }

      // Persist to API, then reconcile with server state
      try {
        await api(`/api/kanban/cards/${activeId}`, {
          method: "PATCH",
          body: JSON.stringify({
            columnId: targetColumnId,
            sortOrder: newOrder,
          }),
          silent: true,
        });
      } catch { /* ignore */ }
      // Always reconcile to fix any stale state from optimistic updates
      fetchBoard();
    },
    [board, columns, fetchBoard],
  );

  // Create card
  const handleCreateCard = useCallback(
    async (data: { title: string; description: string; priority: string; agentIds: string[] }) => {
      if (!board || !addColumnId) return;
      setAddColumnId(null);

      try {
        const card = await api<KanbanCard>("/api/kanban/cards", {
          method: "POST",
          body: JSON.stringify({
            boardId: board.id,
            columnId: addColumnId,
            title: data.title,
            description: data.description || null,
            priority: data.priority,
          }),
        });

        // Assign agents
        for (const agentId of data.agentIds) {
          await api(`/api/kanban/cards/${card.id}/agents`, {
            method: "POST",
            body: JSON.stringify({ agentId }),
            silent: true,
          });
        }

        fetchBoard();
      } catch { /* api shows toast */ }
    },
    [board, addColumnId, fetchBoard],
  );

  // Delete card
  const handleDeleteCard = useCallback(
    async (cardId: string) => {
      // Close detail sheet if deleting the viewed card
      if (selectedCard?.id === cardId) setSelectedCard(null);
      // Optimistic remove
      setBoard((prev) => {
        if (!prev) return prev;
        return { ...prev, cards: prev.cards.filter((c) => c.id !== cardId) };
      });
      try {
        await api(`/api/kanban/cards/${cardId}`, { method: "DELETE", silent: true });
      } catch {
        fetchBoard(); // rollback
      }
    },
    [fetchBoard, selectedCard],
  );

  // Select card for detail view
  const handleSelectCard = useCallback((card: KanbanCard) => {
    setSelectedCard(card);
  }, []);

  // After editing, refresh and keep detail sheet open with updated data
  const handleCardUpdate = useCallback(async () => {
    await fetchBoard();
  }, [fetchBoard]);

  // Keep selectedCard in sync with board data after refresh
  useEffect(() => {
    if (selectedCard && board) {
      const updated = board.cards.find((c) => c.id === selectedCard.id);
      if (updated && (updated.title !== selectedCard.title || updated.description !== selectedCard.description || updated.priority !== selectedCard.priority)) {
        setSelectedCard(updated);
      }
    }
  }, [board, selectedCard]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm text-muted-foreground">Failed to load board.</p>
        <button type="button" onClick={fetchBoard} className="text-sm text-brand-text hover:underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col">
      {/* Board toolbar */}
      <div className="flex items-center justify-end px-3 pt-3 md:px-4 md:pt-4 pb-0">
        <button
          type="button"
          onClick={() => setArchivedOpen(true)}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Archive className="h-3.5 w-3.5" />
          Archived
        </button>
      </div>
      <div className="flex flex-1 overflow-x-auto px-3 pb-3 md:px-4 md:pb-4 pt-2 gap-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {columns.map((col) => (
            <KanbanColumnView
              key={col.id}
              column={col}
              cards={cardsByColumn.get(col.id) ?? []}
              cardAgentsMap={cardAgentsMap}
              agentEmojis={agentEmojis}
              agentNames={agentNames}
              onAddCard={setAddColumnId}
              onDeleteCard={handleDeleteCard}
              onSelectCard={handleSelectCard}
            />
          ))}

          <DragOverlay>
            {activeCard ? <CardOverlay card={activeCard} /> : null}
          </DragOverlay>
        </DndContext>
      </div>
      </div>

      <AddCardSheet
        open={addColumnId !== null}
        onClose={() => setAddColumnId(null)}
        onSubmit={handleCreateCard}
        streamAgents={streamAgentsList}
      />

      <CardDetailSheet
        card={selectedCard}
        cardAgents={selectedCard ? (cardAgentsMap.get(selectedCard.id) ?? []) : []}
        cardNotes={selectedCard ? (cardNotesMap.get(selectedCard.id) ?? []) : []}
        cardCommits={selectedCard ? (cardCommitsMap.get(selectedCard.id) ?? []) : []}
        agentEmojis={agentEmojis}
        agentNames={agentNames}
        onClose={() => setSelectedCard(null)}
        onUpdate={handleCardUpdate}
      />

      {board && (
        <ArchivedCardsSheet
          open={archivedOpen}
          boardId={board.id}
          onClose={() => setArchivedOpen(false)}
          onUnarchived={fetchBoard}
        />
      )}
    </>
  );
}
