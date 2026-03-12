"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Archive,
  ChevronDown,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { CardDetailSheet } from "./card-detail-sheet";
import { AddCardSheet } from "./add-card-sheet";
import { ArchivedCardsSheet } from "./archived-cards-sheet";
import { FullColumn, CompactColumn } from "./kanban-column";
import { CardOverlay } from "./kanban-card";
import type { KanbanCard, KanbanColumn, BoardData, CardCommit } from "./types";

// ── Types ────────────────────────────────────────────────────

interface BoardInfo {
  id: string;
  name: string;
  createdAt?: string;
}

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

  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [addColumnId, setAddColumnId] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);

  // Board management state
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [renamingBoard, setRenamingBoard] = useState(false);
  const [renameBoardName, setRenameBoardName] = useState("");
  const [deleteBoardConfirm, setDeleteBoardConfirm] = useState(false);

  // Column management state
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");

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

  const fetchBoards = useCallback(async () => {
    try {
      const result = await api<BoardInfo[]>("/api/kanban/boards", { silent: true });
      setBoards(result);
      return result;
    } catch {
      return [];
    }
  }, []);

  const fetchBoard = useCallback(async (boardId?: string) => {
    try {
      const allBoards = await fetchBoards();
      if (allBoards.length === 0) { setLoading(false); return; }
      const targetId = boardId || selectedBoardId || allBoards[0].id;
      if (!selectedBoardId) setSelectedBoardId(targetId);
      const data = await api<BoardData>(`/api/kanban/boards/${targetId}`, { silent: true });
      setBoard(data);
      setSelectedBoardId(targetId);
    } catch { /* ignore */ }
    setLoading(false);
  }, [fetchBoards, selectedBoardId]);

  useEffect(() => {
    fetchBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Board CRUD ────────────────────────────────────────

  const handleCreateBoard = useCallback(async () => {
    if (!newBoardName.trim()) return;
    try {
      const newBoard = await api<BoardInfo>("/api/kanban/boards", {
        method: "POST",
        body: JSON.stringify({ name: newBoardName.trim() }),
      });
      setNewBoardName("");
      setCreatingBoard(false);
      setSelectedBoardId(newBoard.id);
      await fetchBoard(newBoard.id);
    } catch { /* api shows toast */ }
  }, [newBoardName, fetchBoard]);

  const handleRenameBoard = useCallback(async () => {
    if (!renameBoardName.trim() || !selectedBoardId) return;
    try {
      await api(`/api/kanban/boards/${selectedBoardId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: renameBoardName.trim() }),
      });
      setRenamingBoard(false);
      setRenameBoardName("");
      await fetchBoard(selectedBoardId);
    } catch { /* api shows toast */ }
  }, [renameBoardName, selectedBoardId, fetchBoard]);

  const handleDeleteBoard = useCallback(async () => {
    if (!selectedBoardId) return;
    try {
      await api(`/api/kanban/boards/${selectedBoardId}`, { method: "DELETE" });
      setDeleteBoardConfirm(false);
      setSelectedBoardId(null);
      setBoard(null);
      setLoading(true);
      await fetchBoard();
    } catch { /* api shows toast */ }
  }, [selectedBoardId, fetchBoard]);

  const handleSwitchBoard = useCallback(async (boardId: string) => {
    setSelectedBoardId(boardId);
    setLoading(true);
    await fetchBoard(boardId);
  }, [fetchBoard]);

  // ── Column CRUD ───────────────────────────────────────

  const handleCreateColumn = useCallback(async () => {
    if (!newColumnName.trim() || !board) return;
    try {
      await api(`/api/kanban/boards/${board.id}/columns`, {
        method: "POST",
        body: JSON.stringify({ name: newColumnName.trim() }),
      });
      setNewColumnName("");
      setAddingColumn(false);
      await fetchBoard(board.id);
    } catch { /* api shows toast */ }
  }, [newColumnName, board, fetchBoard]);

  const handleRenameColumn = useCallback(async (columnId: string, name: string) => {
    try {
      await api(`/api/kanban/columns/${columnId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      await fetchBoard(board?.id);
    } catch { /* api shows toast */ }
  }, [board, fetchBoard]);

  const handleDeleteColumn = useCallback(async (columnId: string, moveToColumnId?: string) => {
    try {
      const qs = moveToColumnId ? `?moveToColumnId=${moveToColumnId}` : "";
      await api(`/api/kanban/columns/${columnId}${qs}`, { method: "DELETE" });
      await fetchBoard(board?.id);
    } catch { /* api shows toast */ }
  }, [board, fetchBoard]);

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
      fetchBoard(board.id);
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
        fetchBoard(board.id);
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
        fetchBoard(board.id);
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
        fetchBoard(board?.id);
      } catch { /* ignore */ }
    },
    [fetchBoard, board],
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
        fetchBoard(board?.id);
      }
    },
    [fetchBoard, selectedCard, board],
  );

  const handleSelectCard = useCallback((card: KanbanCard) => {
    setSelectedCard(card);
  }, []);

  const handleCardUpdate = useCallback(async () => {
    await fetchBoard(board?.id);
  }, [fetchBoard, board]);

  // Keep selectedCard in sync after refresh
  useEffect(() => {
    if (selectedCard && board) {
      const updated = board.cards.find((c) => c.id === selectedCard.id);
      if (updated && (updated.title !== selectedCard.title || updated.description !== selectedCard.description || updated.priority !== selectedCard.priority)) {
        setSelectedCard(updated);
      }
    }
  }, [board, selectedCard]);

  // ── Board selector ────────────────────────────────────

  const currentBoard = boards.find((b) => b.id === selectedBoardId);

  const boardSelector = (
    <div className="flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold hover:bg-muted transition-colors"
          >
            {currentBoard?.name ?? "Board"}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {boards.map((b) => (
            <DropdownMenuItem
              key={b.id}
              onClick={() => handleSwitchBoard(b.id)}
              className={b.id === selectedBoardId ? "bg-accent" : ""}
            >
              {b.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        onClick={() => setCreatingBoard(true)}
        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title="New board"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      {currentBoard && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => { setRenameBoardName(currentBoard.name); setRenamingBoard(true); }}>
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDeleteBoardConfirm(true)} className="text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  // ── Add Column button ─────────────────────────────────

  const addColumnButton = (
    <div className="flex w-64 shrink-0 flex-col items-center justify-start pt-2">
      {addingColumn ? (
        <div className="w-full space-y-1.5 rounded-xl border border-border bg-muted/30 p-3">
          <Input
            value={newColumnName}
            onChange={(e) => setNewColumnName(e.target.value)}
            placeholder="Column name"
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateColumn();
              if (e.key === "Escape") { setAddingColumn(false); setNewColumnName(""); }
            }}
          />
          <div className="flex gap-1">
            <Button size="sm" className="h-7 text-xs flex-1" onClick={handleCreateColumn}>
              Add
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAddingColumn(false); setNewColumnName(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingColumn(true)}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Column
        </button>
      )}
    </div>
  );

  // ── Loading / empty states ──────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const emptyState = !board ? (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
      <p className="text-sm text-muted-foreground">
        {mode === "compact" ? t("chat.kanban.empty") : "Failed to load board."}
      </p>
      <button type="button" onClick={() => fetchBoard()} className="text-sm text-brand-text hover:underline">
        Retry
      </button>
    </div>
  ) : null;

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
            allColumns={columns}
            cardAgentsMap={cardAgentsMap}
            agentEmojis={agentEmojis}
            agentNames={agentNames}
            onAddCard={setAddColumnId}
            onDeleteCard={handleDeleteCard}
            onSelectCard={handleSelectCard}
            onRenameColumn={handleRenameColumn}
            onDeleteColumn={handleDeleteColumn}
          />
        );
      })}
      {addColumnButton}
    </div>
  );

  // ── Board dialogs (shared between full & compact) ────

  const boardDialogs = (
    <>
      {/* Create Board Dialog */}
      <Dialog open={creatingBoard} onOpenChange={setCreatingBoard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Board</DialogTitle>
            <DialogDescription>
              Enter a name for the new board.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newBoardName}
            onChange={(e) => setNewBoardName(e.target.value)}
            placeholder="Board name"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateBoard(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreatingBoard(false); setNewBoardName(""); }}>Cancel</Button>
            <Button onClick={handleCreateBoard} disabled={!newBoardName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Board Dialog */}
      <Dialog open={renamingBoard} onOpenChange={setRenamingBoard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Board</DialogTitle>
          </DialogHeader>
          <Input
            value={renameBoardName}
            onChange={(e) => setRenameBoardName(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleRenameBoard(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingBoard(false)}>Cancel</Button>
            <Button onClick={handleRenameBoard} disabled={!renameBoardName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Board Dialog */}
      <Dialog open={deleteBoardConfirm} onOpenChange={setDeleteBoardConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Board</DialogTitle>
            <DialogDescription>
              This will permanently delete the board and all its columns and cards. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteBoardConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteBoard}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  // ── Full mode layout ──────────────────────────────────

  if (mode === "full") {
    return (
      <>
        <div className="flex h-full flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 pt-3 md:px-4 md:pt-4 pb-0">
            {boardSelector}
            <button
              type="button"
              onClick={() => setArchivedOpen(true)}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Archive className="h-3.5 w-3.5" />
              Archived
            </button>
          </div>

          {emptyState ?? (
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
          )}
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
          onDelete={handleDeleteCard}
        />

        {board && (
          <ArchivedCardsSheet
            open={archivedOpen}
            boardId={board.id}
            onClose={() => setArchivedOpen(false)}
            onUnarchived={() => fetchBoard(board.id)}
          />
        )}

        {boardDialogs}
      </>
    );
  }

  // ── Compact mode layout ───────────────────────────────

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0 h-full">
        {/* Board selector for compact mode */}
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-1 shrink-0">
          {boardSelector}
        </div>
        {emptyState ?? (
          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden h-full">
            {columns.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                {t("chat.kanban.empty")}
              </div>
            ) : (
              columnsContent
            )}
          </div>
        )}
      </div>

      <CardDetailSheet
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
        onUpdate={handleCardUpdate}
        onDelete={handleDeleteCard}
      />

      {boardDialogs}
    </>
  );
}
