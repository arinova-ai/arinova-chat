"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, ChevronLeft, ChevronRight, Clock, KanbanSquare, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { PriorityBadge } from "./kanban-card";
import { formatTime } from "./types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

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

interface ArchivedBoard {
  id: string;
  name: string;
  archived?: boolean;
}

interface ArchivedCardsSheetProps {
  open: boolean;
  boardId: string;
  onClose: () => void;
  onUnarchived: () => void;
  archivedBoards?: ArchivedBoard[];
  onUnarchiveBoard?: (boardId: string) => void;
  onDeleteBoard?: (boardId: string) => void;
}

export function ArchivedCardsSheet({ open, boardId, onClose, onUnarchived, archivedBoards, onUnarchiveBoard, onDeleteBoard }: ArchivedCardsSheetProps) {
  const [data, setData] = useState<ArchivedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [unarchivingId, setUnarchivingId] = useState<string | null>(null);
  const [unarchivingBoardId, setUnarchivingBoardId] = useState<string | null>(null);
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

  const handleUnarchiveBoard = async (id: string) => {
    setUnarchivingBoardId(id);
    try {
      onUnarchiveBoard?.(id);
    } finally {
      setUnarchivingBoardId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:w-96 border-border bg-background flex flex-col overflow-hidden pt-[max(1rem,env(safe-area-inset-top))]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Archive
          </SheetTitle>
          <SheetDescription className="sr-only">View and restore archived boards and cards</SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex-1 min-h-0 overflow-y-auto space-y-4 px-1">
          {/* Archived Boards Section */}
          {archivedBoards && archivedBoards.length > 0 && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground px-1">
                <KanbanSquare className="h-3.5 w-3.5" />
                Archived Boards ({archivedBoards.length})
              </h3>
              {archivedBoards.map((board) => (
                <div
                  key={board.id}
                  className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-2"
                >
                  <p className="text-sm font-medium text-foreground truncate">{board.name}</p>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleUnarchiveBoard(board.id)}
                      disabled={unarchivingBoardId === board.id}
                      className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-brand-text hover:bg-brand/10 transition-colors disabled:opacity-50"
                    >
                      {unarchivingBoardId === board.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      Unarchive
                    </button>
                    {onDeleteBoard && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete "${board.name}"? All columns, cards, and labels will be permanently removed.`)) {
                            onDeleteBoard(board.id);
                          }
                        }}
                        className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Archived Cards Section */}
          <div className="space-y-2">
            {(archivedBoards && archivedBoards.length > 0) && (
              <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground px-1">
                <Archive className="h-3.5 w-3.5" />
                Archived Cards
              </h3>
            )}
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
