"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SquareKanban,
  Plus,
  Loader2,
  X,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";

interface KanbanSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Board { id: string; name: string; }
interface Column { id: string; boardId: string; name: string; sortOrder: number; }
interface Card { id: string; columnId: string; title: string; description: string | null; priority: string | null; sortOrder: number; }

// Priority colors
const PRIORITY_COLORS: Record<string, string> = {
  urgent: "border-l-red-500",
  high: "border-l-orange-500",
  medium: "border-l-yellow-500",
  low: "border-l-green-500",
};

export function KanbanSidebar({ open, onOpenChange }: KanbanSidebarProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isMobileRaw = useIsMobile();
  const isMobile = mounted ? isMobileRaw : false;

  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoard, setActiveBoard] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newCardColumnId, setNewCardColumnId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchBoards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<Board[]>("/api/kanban/boards", { silent: true });
      setBoards(res);
      if (res.length > 0 && !activeBoard) setActiveBoard(res[0].id);
    } catch {}
    setLoading(false);
  }, [activeBoard]);

  const fetchBoard = useCallback(async (boardId: string) => {
    try {
      const res = await api<{ columns: Column[]; cards: Card[] }>(`/api/kanban/boards/${boardId}`, { silent: true });
      setColumns(res.columns);
      setCards(res.cards);
    } catch {}
  }, []);

  useEffect(() => {
    if (open) fetchBoards();
  }, [open, fetchBoards]);

  useEffect(() => {
    if (activeBoard) fetchBoard(activeBoard);
  }, [activeBoard, fetchBoard]);

  const handleCreateCard = async (columnId: string) => {
    if (!newCardTitle.trim() || !activeBoard) return;
    setCreating(true);
    try {
      await api("/api/kanban/cards", {
        method: "POST",
        body: JSON.stringify({
          boardId: activeBoard,
          columnId,
          title: newCardTitle.trim(),
        }),
      });
      setNewCardTitle("");
      setNewCardColumnId(null);
      if (activeBoard) fetchBoard(activeBoard);
    } catch {}
    setCreating(false);
  };

  const handleMoveCard = async (cardId: string, targetColumnId: string) => {
    try {
      await api(`/api/kanban/cards/${cardId}`, {
        method: "PATCH",
        body: JSON.stringify({ columnId: targetColumnId }),
      });
      if (activeBoard) fetchBoard(activeBoard);
    } catch {}
  };

  if (!mounted || !open) return null;

  const backdrop = (
    <div
      className="fixed inset-0 z-50 bg-black/50 animate-in fade-in"
      onClick={() => onOpenChange(false)}
    />
  );

  const panel = (
    <div
      className={cn(
        "fixed z-50 shadow-lg animate-in overflow-hidden flex flex-col",
        isMobile
          ? "inset-x-0 bottom-0 rounded-t-2xl border-border bg-secondary px-2 pb-6 pt-3 max-h-[80vh] slide-in-from-bottom"
          : "inset-y-0 right-0 w-full sm:w-full sm:max-w-none p-0 flex flex-col bg-secondary border-l border-border slide-in-from-right"
      )}
    >
      {isMobile && <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <SquareKanban className="h-5 w-5 text-brand" />
          <h2 className="text-base font-semibold">{t("chat.kanban.title")}</h2>
        </div>
        <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg p-1 hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : columns.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            {t("chat.kanban.empty")}
          </div>
        ) : (
          <div className="flex gap-3 p-4 h-full min-w-max">
            {columns.map((col) => {
              const colCards = cards.filter((c) => c.columnId === col.id);
              return (
                <div key={col.id} className="flex flex-col w-64 shrink-0 rounded-lg bg-muted/30 p-2">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {col.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{colCards.length}</span>
                  </div>

                  <div className="flex-1 space-y-1.5 overflow-y-auto min-h-0">
                    {colCards.map((card) => (
                      <div
                        key={card.id}
                        className={cn(
                          "rounded-md border border-border bg-card p-2 text-sm border-l-2",
                          PRIORITY_COLORS[card.priority ?? "medium"] ?? "border-l-transparent"
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
                          onChange={(e) => handleMoveCard(card.id, e.target.value)}
                        >
                          {columns.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  {/* Add card */}
                  {newCardColumnId === col.id ? (
                    <div className="mt-2 space-y-1">
                      <Input
                        value={newCardTitle}
                        onChange={(e) => setNewCardTitle(e.target.value)}
                        placeholder={t("chat.kanban.newCardPlaceholder")}
                        className="h-7 text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCreateCard(col.id);
                          if (e.key === "Escape") { setNewCardColumnId(null); setNewCardTitle(""); }
                        }}
                      />
                      <div className="flex gap-1">
                        <Button size="sm" className="h-6 text-xs flex-1" onClick={() => handleCreateCard(col.id)} disabled={creating}>
                          {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : t("common.add")}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setNewCardColumnId(null); setNewCardTitle(""); }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setNewCardColumnId(col.id)}
                      className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-1 py-0.5"
                    >
                      <Plus className="h-3 w-3" />
                      {t("chat.kanban.addCard")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(
    <>
      {backdrop}
      {panel}
    </>,
    document.body
  );
}
