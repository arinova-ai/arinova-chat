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
import { Archive, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { CardDetailSheet } from "./card-detail-sheet";
import { AddCardSheet } from "./add-card-sheet";
import { ArchivedCardsSheet } from "./archived-cards-sheet";
import { FullColumn, CompactColumn } from "./kanban-column";
import { CardOverlay } from "./kanban-card";
import type { KanbanCard, KanbanColumn, BoardData, CardCommit } from "./types";

// ── Props ───────────────────────────────────────────────────

export interface KanbanBoardProps {
  /** "full" = Office (DnD, agent display, archived); "compact" = sidebar (dropdown move, inline add) */
  mode: "full" | "compact";
  /** Agent data from office stream — only needed for full mode */
  streamAgents?: { id: string; name: string; emoji: string }[];
}

// ── Component ───────────────────────────────────────────────

export function KanbanBoard({ mode, streamAgents = [] }: KanbanBoardProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isMobileRaw = useIsMobile();
  const isMobile = mounted ? isMobileRaw : false;

  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [addColumnId, setAddColumnId] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);

  // Use DnD in full mode on desktop only
  const useDnd = mode === "full" && !isMobile;

  // ── Agent maps ──────────────────────────────────────────

  const agentEmojis = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of streamAgents) {
      if (a.id && a.emoji) map.set(a.id, a.emoji);
    }
    return map;
  }, [streamAgents]);

  const agentNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of streamAgents) {
      if (a.id && a.name) map.set(a.id, a.name);
    }
    return map;
  }, [streamAgents]);

  // ── Data fetching ───────────────────────────────────────

  const fetchBoard = useCallback(async () => {
    try {
      const boards = await api<{ id: string }[]>("/api/kanban/boards", { silent: true });
      if (boards.length === 0) { setLoading(false); return; }
      const data = await api<BoardData>(`/api/kanban/boards/${boards[0].id}`, { silent: true });
      setBoard(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // ── Derived data ────────────────────────────────────────

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

  // ── DnD handlers (full mode only) ──────────────────────

  const findCard = useCallback(
    (id: string) => board?.cards.find((c) => c.id === id) ?? null,
    [board],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveCard(findCard(event.active.id as string));
    },
    [findCard],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over || !board) return;

      const activeId = active.id as string;
      const overId = over.id as string;
      const card = board.cards.find((c) => c.id === activeId);
      if (!card) return;

      let targetColumnId: string | null = null;
      const overCard = board.cards.find((c) => c.id === overId);
      if (overCard) {
        targetColumnId = overCard.columnId;
      } else if (columns.some((col) => col.id === overId)) {
        targetColumnId = overId;
      }

      if (!targetColumnId || card.columnId === targetColumnId) return;

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
      const card = board.cards.find((c) => c.id === activeId);
      if (!card) return;

      let targetColumnId = card.columnId;
      const overCard = board.cards.find((c) => c.id === overId);
      if (overCard) targetColumnId = overCard.columnId;
      else if (columns.some((col) => col.id === overId)) targetColumnId = overId;

      const colCards = board.cards
        .filter((c) => c.columnId === targetColumnId && c.id !== activeId)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      let newOrder = 0;
      if (overCard && overCard.id !== activeId) {
        const overIdx = colCards.findIndex((c) => c.id === overId);
        if (overIdx >= 0) {
          newOrder = overIdx + 1;
          const reindexed = [...colCards];
          reindexed.splice(newOrder, 0, { ...card, columnId: targetColumnId });
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
        }
      }

      try {
        await api(`/api/kanban/cards/${activeId}`, {
          method: "PATCH",
          body: JSON.stringify({ columnId: targetColumnId, sortOrder: newOrder }),
          silent: true,
        });
      } catch { /* ignore */ }
      fetchBoard();
    },
    [board, columns, fetchBoard],
  );

  // ── Card CRUD ───────────────────────────────────────────

  const handleCreateCardFull = useCallback(
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

  const handleCreateCardCompact = useCallback(
    async (columnId: string, title: string) => {
      if (!board) return;
      try {
        await api("/api/kanban/cards", {
          method: "POST",
          body: JSON.stringify({ boardId: board.id, columnId, title }),
        });
        fetchBoard();
      } catch { /* ignore */ }
    },
    [board, fetchBoard],
  );

  const handleMoveCard = useCallback(
    async (cardId: string, targetColumnId: string) => {
      try {
        await api(`/api/kanban/cards/${cardId}`, {
          method: "PATCH",
          body: JSON.stringify({ columnId: targetColumnId }),
        });
        fetchBoard();
      } catch { /* ignore */ }
    },
    [fetchBoard],
  );

  const handleDeleteCard = useCallback(
    async (cardId: string) => {
      if (selectedCard?.id === cardId) setSelectedCard(null);
      setBoard((prev) => {
        if (!prev) return prev;
        return { ...prev, cards: prev.cards.filter((c) => c.id !== cardId) };
      });
      try {
        await api(`/api/kanban/cards/${cardId}`, { method: "DELETE", silent: true });
      } catch {
        fetchBoard();
      }
    },
    [fetchBoard, selectedCard],
  );

  const handleSelectCard = useCallback((card: KanbanCard) => {
    setSelectedCard(card);
  }, []);

  const handleCardUpdate = useCallback(async () => {
    await fetchBoard();
  }, [fetchBoard]);

  // Keep selectedCard in sync after refresh
  useEffect(() => {
    if (selectedCard && board) {
      const updated = board.cards.find((c) => c.id === selectedCard.id);
      if (updated && (updated.title !== selectedCard.title || updated.description !== selectedCard.description || updated.priority !== selectedCard.priority)) {
        setSelectedCard(updated);
      }
    }
  }, [board, selectedCard]);

  // ── Loading / empty states ──────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm text-muted-foreground">
          {mode === "compact" ? t("chat.kanban.empty") : "Failed to load board."}
        </p>
        <button type="button" onClick={fetchBoard} className="text-sm text-brand-text hover:underline">
          Retry
        </button>
      </div>
    );
  }

  // ── Render columns ────────────────────────────────────

  const columnsContent = (
    <div className={`flex gap-3 ${mode === "compact" ? "p-4 h-full min-w-max" : ""}`}>
      {columns.map((col) => {
        const colCards = cardsByColumn.get(col.id) ?? [];

        if (mode === "compact" || isMobile) {
          return (
            <CompactColumn
              key={col.id}
              column={col}
              cards={colCards}
              allColumns={columns}
              onMoveCard={handleMoveCard}
              onSelectCard={handleSelectCard}
              onCreateCard={handleCreateCardCompact}
            />
          );
        }

        return (
          <FullColumn
            key={col.id}
            column={col}
            cards={colCards}
            cardAgentsMap={cardAgentsMap}
            agentEmojis={agentEmojis}
            agentNames={agentNames}
            onAddCard={setAddColumnId}
            onDeleteCard={handleDeleteCard}
            onSelectCard={handleSelectCard}
          />
        );
      })}
    </div>
  );

  // ── Full mode layout ──────────────────────────────────

  if (mode === "full") {
    return (
      <>
        <div className="flex h-full flex-col">
          {/* Toolbar */}
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
            {useDnd ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                {columnsContent}
                <DragOverlay>
                  {activeCard ? <CardOverlay card={activeCard} /> : null}
                </DragOverlay>
              </DndContext>
            ) : (
              columnsContent
            )}
          </div>
        </div>

        <AddCardSheet
          open={addColumnId !== null}
          onClose={() => setAddColumnId(null)}
          onSubmit={handleCreateCardFull}
          streamAgents={streamAgents}
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

  // ── Compact mode layout ───────────────────────────────

  return (
    <>
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden h-full">
        {columns.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            {t("chat.kanban.empty")}
          </div>
        ) : (
          columnsContent
        )}
      </div>

      <CardDetailSheet
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
        onUpdate={handleCardUpdate}
      />
    </>
  );
}
