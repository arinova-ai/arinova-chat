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
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  Archive,
  ArchiveRestore,
  Bot,
  Check,
  ChevronDown,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { wsManager } from "@/lib/ws";
import { useTranslation } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useChatStore } from "@/store/chat-store";
import { CardDetailSheet } from "./card-detail-sheet";
import { AddCardSheet } from "./add-card-sheet";
import { ArchivedCardsSheet } from "./archived-cards-sheet";
import { FullColumn } from "./kanban-column";
import { CardOverlay } from "./kanban-card";
import type { KanbanCard, BoardData, CardCommit } from "./types";

// ── Types ────────────────────────────────────────────────────

interface BoardInfo {
  id: string;
  name: string;
  createdAt?: string;
  archived?: boolean;
  ownerId?: string;
  ownerUsername?: string | null;
}

// ── Props ───────────────────────────────────────────────────

export interface KanbanBoardProps {
  /** Agent data from office stream */
  streamAgents?: { id: string; name: string; emoji: string }[];
  /** Conversation ID — used for persisting board selection per conversation */
  conversationId?: string;
}

// ── Component ───────────────────────────────────────────────

export function KanbanBoard({ streamAgents = [], conversationId }: KanbanBoardProps) {
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
  const [searchQuery, setSearchQuery] = useState("");
  const [archivedBoards, setArchivedBoards] = useState<BoardInfo[]>([]);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Board management state
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [renamingBoard, setRenamingBoard] = useState(false);
  const [autoArchiveDays, setAutoArchiveDays] = useState(3);
  const [renameBoardName, setRenameBoardName] = useState("");
  const [archiveBoardConfirm, setArchiveBoardConfirm] = useState(false);

  // Edit mode + column management state
  const [editMode, setEditMode] = useState(false);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");

  // Board members state
  const [membersOpen, setMembersOpen] = useState(false);
  const [boardMembers, setBoardMembers] = useState<{ userId: string; username: string; permission: string }[]>([]);
  const [boardOwner, setBoardOwner] = useState<{ userId: string; username: string } | null>(null);
  const [inviteUsername, setInviteUsername] = useState("");
  const [invitePermission, setInvitePermission] = useState("view");
  const [membersLoading, setMembersLoading] = useState(false);
  const [friendsList, setFriendsList] = useState<{ id: string; name: string; username: string | null; image: string | null }[]>([]);

  // Agent permissions state
  const [agentPermsOpen, setAgentPermsOpen] = useState(false);
  const [allAgents, setAllAgents] = useState<{ id: string; name: string }[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [agentPermsLoading, setAgentPermsLoading] = useState(false);

  // Use DnD in full mode on desktop only
  const useDnd = !isMobile;

  // ── Agent data (fetched from API for name + avatar) ────
  const [fetchedAgents, setFetchedAgents] = useState<{ id: string; name: string; avatarUrl?: string | null }[]>([]);

  useEffect(() => {
    api<{ id: string; name: string; avatarUrl?: string | null }[]>("/api/agents", { silent: true })
      .then((res) => setFetchedAgents(res || []))
      .catch(() => {});
  }, []);

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
    // Prefer fetched agents (always available), fall back to stream agents
    for (const a of fetchedAgents) {
      if (a.id && a.name) map.set(a.id, a.name);
    }
    for (const a of streamAgents) {
      if (a.id && a.name && !map.has(a.id)) map.set(a.id, a.name);
    }
    return map;
  }, [streamAgents, fetchedAgents]);

  const agentAvatars = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of fetchedAgents) {
      if (a.id && a.avatarUrl) map.set(a.id, a.avatarUrl);
    }
    return map;
  }, [fetchedAgents]);

  // ── Data fetching ───────────────────────────────────────

  const fetchBoards = useCallback(async () => {
    try {
      const result = await api<BoardInfo[]>("/api/kanban/boards", { silent: true });
      setBoards(result);
      // Also fetch archived boards
      try {
        const allBoards = await api<BoardInfo[]>("/api/kanban/boards?includeArchived=true", { silent: true });
        setArchivedBoards(allBoards.filter((b) => b.archived));
      } catch { /* ignore */ }
      return result;
    } catch {
      return [];
    }
  }, []);

  const fetchBoard = useCallback(async (boardId?: string, ignoreCurrentSelection?: boolean) => {
    try {
      const allBoards = await fetchBoards();
      if (allBoards.length === 0) { setLoading(false); return; }

      // If no explicit boardId, try loading persisted preference
      let targetId = boardId || (ignoreCurrentSelection ? null : selectedBoardId);
      if (!targetId && conversationId) {
        // Load from per-conversation board preference
        try {
          const pref = await api<{ boardId?: string | null }>(
            `/api/conversations/${conversationId}/board-preference`,
            { silent: true },
          );
          if (pref.boardId && allBoards.some((b) => b.id === String(pref.boardId))) {
            targetId = String(pref.boardId);
          }
        } catch { /* ignore */ }
      }
      if (!targetId && !conversationId) {
        // Load from localStorage
        try {
          const stored = localStorage.getItem("kanban_selected_board");
          if (stored && allBoards.some((b) => b.id === stored)) {
            targetId = stored;
          }
        } catch { /* ignore */ }
      }
      targetId = targetId || allBoards[0].id;

      if (!selectedBoardId) setSelectedBoardId(targetId);
      const data = await api<BoardData>(`/api/kanban/boards/${targetId}`, { silent: true });
      setBoard(data);
      setSelectedBoardId(targetId);
    } catch { /* ignore */ }
    setLoading(false);
  }, [fetchBoards, selectedBoardId, conversationId]);

  useEffect(() => {
    fetchBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset board selection when conversationId changes
  useEffect(() => {
    setSelectedBoardId(null);
    setBoard(null);
    setLoading(true);
    fetchBoard(undefined, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

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
        body: JSON.stringify({ name: renameBoardName.trim(), autoArchiveDays: autoArchiveDays }),
      });
      setRenamingBoard(false);
      setRenameBoardName("");
      await fetchBoard(selectedBoardId);
    } catch { /* api shows toast */ }
  }, [renameBoardName, selectedBoardId, fetchBoard]);

  const handleArchiveBoard = useCallback(async () => {
    if (!selectedBoardId) return;
    try {
      await api(`/api/kanban/boards/${selectedBoardId}/archive`, { method: "POST" });
      setArchiveBoardConfirm(false);
      setSelectedBoardId(null);
      setBoard(null);
      setLoading(true);
      await fetchBoard();
    } catch { /* api shows toast */ }
  }, [selectedBoardId, fetchBoard]);

  const handleUnarchiveBoard = useCallback(async (boardId: string) => {
    try {
      await api(`/api/kanban/boards/${boardId}/archive`, { method: "POST" });
      await fetchBoard(selectedBoardId || undefined);
    } catch { /* api shows toast */ }
  }, [selectedBoardId, fetchBoard]);

  const handleSwitchBoard = useCallback(async (boardId: string) => {
    setSelectedBoardId(boardId);
    setLoading(true);
    await fetchBoard(boardId);
    // Persist board selection
    if (conversationId) {
      api(`/api/conversations/${conversationId}/board-preference`, {
        method: "PUT",
        body: JSON.stringify({ boardId }),
        silent: true,
      }).catch((err) => {
        console.error("[board-preference] PUT failed:", err);
      });
    } else {
      try { localStorage.setItem("kanban_selected_board", boardId); } catch { /* ignore */ }
    }
  }, [fetchBoard, conversationId]);

  // ── Board Members ──────────────────────────────────────

  const fetchBoardMembers = useCallback(async () => {
    if (!selectedBoardId) return;
    setMembersLoading(true);
    try {
      const [data, friends] = await Promise.all([
        api<{ owner: { userId: string; username: string } | null; members: { userId: string; username: string; permission: string }[] }>(
          `/api/kanban/boards/${selectedBoardId}/members`
        ),
        api<{ id: string; name: string; username: string | null; image: string | null }[]>("/api/friends").catch(() => [] as { id: string; name: string; username: string | null; image: string | null }[]),
      ]);
      setBoardOwner(data.owner);
      setBoardMembers(data.members);
      setFriendsList(friends);
    } catch { /* */ }
    setMembersLoading(false);
  }, [selectedBoardId]);

  const handleInviteMember = useCallback(async () => {
    if (!inviteUsername.trim() || !selectedBoardId) return;
    try {
      await api(`/api/kanban/boards/${selectedBoardId}/members`, {
        method: "POST",
        body: JSON.stringify({ username: inviteUsername.trim(), permission: invitePermission }),
      });
      setInviteUsername("");
      await fetchBoardMembers();
    } catch { /* api shows toast */ }
  }, [inviteUsername, invitePermission, selectedBoardId, fetchBoardMembers]);

  const handleRemoveMember = useCallback(async (userId: string) => {
    if (!selectedBoardId) return;
    try {
      await api(`/api/kanban/boards/${selectedBoardId}/members/${userId}`, { method: "DELETE" });
      await fetchBoardMembers();
    } catch { /* */ }
  }, [selectedBoardId, fetchBoardMembers]);

  const handleUpdateMemberPermission = useCallback(async (userId: string, perm: string) => {
    if (!selectedBoardId) return;
    try {
      await api(`/api/kanban/boards/${selectedBoardId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ permission: perm }),
      });
      await fetchBoardMembers();
    } catch { /* */ }
  }, [selectedBoardId, fetchBoardMembers]);

  // ── Agent permissions ────────────────────────────────
  const handleOpenAgentPerms = useCallback(async () => {
    if (!selectedBoardId) return;
    setAgentPermsOpen(true);
    setAgentPermsLoading(true);
    try {
      const [agentsRes, permsRes] = await Promise.all([
        api<{ id: string; name: string }[]>("/api/agents", { silent: true }),
        api<{ agentIds: string[] }>(`/api/kanban/boards/${selectedBoardId}/agent-permissions`, { silent: true }),
      ]);
      setAllAgents((agentsRes || []).map((a) => ({ id: a.id, name: a.name })));
      setSelectedAgentIds(permsRes.agentIds || []);
    } catch {
      setAllAgents([]);
      setSelectedAgentIds([]);
    } finally {
      setAgentPermsLoading(false);
    }
  }, [selectedBoardId]);

  const handleToggleAgentPerm = useCallback(async (agentId: string) => {
    if (!selectedBoardId) return;
    const next = selectedAgentIds.includes(agentId)
      ? selectedAgentIds.filter((id) => id !== agentId)
      : [...selectedAgentIds, agentId];
    setSelectedAgentIds(next);
    try {
      await api(`/api/kanban/boards/${selectedBoardId}/agent-permissions`, {
        method: "PUT",
        body: JSON.stringify({ agentIds: next }),
      });
    } catch {
      setSelectedAgentIds(selectedAgentIds);
    }
  }, [selectedBoardId, selectedAgentIds]);

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

  const handleDeleteColumn = useCallback(async (columnId: string) => {
    try {
      await api(`/api/kanban/columns/${columnId}`, { method: "DELETE" });
      await fetchBoard(board?.id);
    } catch { /* api shows toast */ }
  }, [board, fetchBoard]);

  // ── Derived data ────────────────────────────────────────

  const columns = useMemo(
    () => (board?.columns ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [board],
  );

  const cardsByColumn = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const map = new Map<string, KanbanCard[]>();
    for (const col of columns) map.set(col.id, []);
    for (const card of board?.cards ?? []) {
      if (q && !card.title.toLowerCase().includes(q) && !(card.description ?? "").toLowerCase().includes(q)) continue;
      const list = map.get(card.columnId);
      if (list) list.push(card);
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [board, columns, searchQuery]);

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

  const cardLabelsMap = useMemo(() => {
    const map = new Map<string, Array<{ labelId: string; labelName: string; labelColor: string }>>();
    for (const cl of board?.cardLabels ?? []) {
      const arr = map.get(cl.cardId) ?? [];
      arr.push({ labelId: cl.labelId, labelName: cl.labelName, labelColor: cl.labelColor });
      map.set(cl.cardId, arr);
    }
    return map;
  }, [board]);

  const boardLabels = useMemo(() => board?.labels ?? [], [board]);

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
      const data = event.active.data.current;
      if (data?.type === "column") return; // column drag — no overlay needed
      setActiveCard(findCard(event.active.id as string));
    },
    [findCard],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over || !board) return;
      // Skip cross-column card moves during column drags
      if (active.data.current?.type === "column") return;

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

      // ── Column reorder ──
      if (active.data.current?.type === "column") {
        const activeId = active.id as string;
        const overId = over.id as string;
        if (activeId === overId) return;
        const oldIndex = columns.findIndex((c) => c.id === activeId);
        const newIndex = columns.findIndex((c) => c.id === overId);
        if (oldIndex < 0 || newIndex < 0) return;
        const reordered = arrayMove(columns, oldIndex, newIndex);
        // Optimistic update
        setBoard((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            columns: reordered.map((col, i) => ({ ...col, sortOrder: i })),
          };
        });
        try {
          await api(`/api/kanban/boards/${board.id}/columns/reorder`, {
            method: "POST",
            body: JSON.stringify({ columnIds: reordered.map((c) => c.id) }),
            silent: true,
          });
        } catch { /* ignore */ }
        fetchBoard(board.id);
        return;
      }

      // ── Card reorder ──
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

  // Auto-select card when navigating from a task preview card in chat
  useEffect(() => {
    const pendingId = useChatStore.getState().pendingKanbanCardId;
    if (pendingId && board) {
      const card = board.cards.find((c) => c.id === pendingId);
      if (card) {
        setSelectedCard(card);
        useChatStore.setState({ pendingKanbanCardId: null });
      }
    }
  }, [board]);

  // Listen for kanban WS broadcasts and refresh board
  useEffect(() => {
    if (!board?.id) return;
    const unsub = wsManager.subscribe((event: Record<string, unknown>) => {
      if (event.type === "kanban_update" && event.boardId === board.id) {
        fetchBoard(board.id);
      }
    });
    return unsub;
  }, [board?.id, fetchBoard]);

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
            {(() => {
              const uid = useChatStore.getState().currentUserId;
              return currentBoard?.ownerId && currentBoard.ownerId !== uid && currentBoard.ownerUsername
                ? <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground font-normal">@{currentBoard.ownerUsername}</span>
                : null;
            })()}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {boards.map((b) => {
            const currentUserId = useChatStore.getState().currentUserId;
            const isShared = b.ownerId && b.ownerId !== currentUserId;
            return (
            <DropdownMenuItem
              key={b.id}
              onClick={() => handleSwitchBoard(b.id)}
              className={`flex items-center justify-between gap-2 ${b.id === selectedBoardId ? "bg-accent" : ""}`}
            >
              <span className="truncate flex items-center gap-1.5">
                {b.name}
                {isShared && b.ownerUsername && (
                  <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">@{b.ownerUsername}</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    const board = boards.find((x) => x.id === b.id);
                    if (!board) return;
                    if (b.id !== selectedBoardId) handleSwitchBoard(b.id);
                    setRenameBoardName(board.name);
                    setRenamingBoard(true);
                  }}
                  title="Rename"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-red-400 disabled:opacity-30"
                  disabled={boards.length <= 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (b.id !== selectedBoardId) handleSwitchBoard(b.id);
                    setArchiveBoardConfirm(true);
                  }}
                  title="Archive"
                >
                  <Archive className="h-3 w-3" />
                </button>
              </span>
            </DropdownMenuItem>
          );
          })}
          <DropdownMenuItem
            onClick={() => setCreatingBoard(true)}
            className="gap-2"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("kanban.addBoard")}
          </DropdownMenuItem>
          {archivedBoards.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                {t("kanban.archived")}
              </DropdownMenuLabel>
              {archivedBoards.map((b) => (
                <DropdownMenuItem
                  key={b.id}
                  className="flex items-center justify-between gap-2 opacity-60"
                >
                  <span className="truncate">{b.name}</span>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnarchiveBoard(b.id);
                    }}
                    title="Unarchive"
                  >
                    <ArchiveRestore className="h-3 w-3" />
                  </button>
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
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
            placeholder={t("kanban.columnName")}
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateColumn();
              if (e.key === "Escape") { setAddingColumn(false); setNewColumnName(""); }
            }}
          />
          <div className="flex gap-1">
            <Button size="sm" className="h-7 text-xs flex-1" onClick={handleCreateColumn}>
              {t("common.add")}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAddingColumn(false); setNewColumnName(""); }}>
              {t("common.cancel")}
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
          {t("kanban.addColumn")}
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
{t("kanban.failedToLoad")}
      </p>
      <button type="button" onClick={() => fetchBoard()} className="text-sm text-brand-text hover:underline">
        {t("common.retry")}
      </button>
    </div>
  ) : null;

  // ── Render columns ────────────────────────────────────

  const columnItems = columns.map((col) => {
    const colCards = cardsByColumn.get(col.id) ?? [];

    return (
      <FullColumn
        key={col.id}
        column={col}
        cards={colCards}
        allColumns={columns}
        cardAgentsMap={cardAgentsMap}
        cardLabelsMap={cardLabelsMap}
        agentEmojis={agentEmojis}
        agentNames={agentNames}
        agentAvatars={agentAvatars}
        editMode={editMode}
        onAddCard={setAddColumnId}
        onDeleteCard={handleDeleteCard}
        onSelectCard={handleSelectCard}
        onMoveCard={isMobile ? handleMoveCard : undefined}
        onRenameColumn={handleRenameColumn}
        onDeleteColumn={handleDeleteColumn}
      />
    );
  });

  const columnsContent = (
    <div className="flex gap-3">
      {useDnd ? (
        <SortableContext items={columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
          {columnItems}
        </SortableContext>
      ) : (
        columnItems
      )}
      {editMode && addColumnButton}
    </div>
  );

  // ── Board dialogs (shared between full & compact) ────

  const boardDialogs = (
    <>
      {/* Create Board Dialog */}
      <Dialog open={creatingBoard} onOpenChange={setCreatingBoard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("kanban.createBoard")}</DialogTitle>
            <DialogDescription>
              {t("kanban.createBoardDesc")}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newBoardName}
            onChange={(e) => setNewBoardName(e.target.value)}
            placeholder={t("kanban.boardName")}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateBoard(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreatingBoard(false); setNewBoardName(""); }}>{t("common.cancel")}</Button>
            <Button onClick={handleCreateBoard} disabled={!newBoardName.trim()}>{t("kanban.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Board Dialog */}
      <Dialog open={renamingBoard} onOpenChange={setRenamingBoard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("kanban.renameBoard")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={renameBoardName}
              onChange={(e) => setRenameBoardName(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleRenameBoard(); }}
            />
            <div>
              <label className="text-xs text-muted-foreground">{t("kanban.autoArchiveDays")}</label>
              <Input
                type="number"
                min={0}
                max={365}
                value={autoArchiveDays}
                onChange={(e) => setAutoArchiveDays(parseInt(e.target.value) || 0)}
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">{t("kanban.autoArchiveDaysDesc")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingBoard(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleRenameBoard} disabled={!renameBoardName.trim()}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Board Dialog */}
      <Dialog open={archiveBoardConfirm} onOpenChange={setArchiveBoardConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("kanban.archiveBoard")}</DialogTitle>
            <DialogDescription>
              {t("kanban.archiveBoardDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveBoardConfirm(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleArchiveBoard}>
              {t("kanban.archive")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Board Members Dialog */}
      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("kanban.boardMembers")}</DialogTitle>
            <DialogDescription>{t("kanban.boardMembersDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Invite from friends */}
            {(() => {
              const memberIds = new Set([boardOwner?.userId, ...boardMembers.map((m) => m.userId)]);
              const available = friendsList.filter((f) => !memberIds.has(f.id));
              return available.length > 0 ? (
                <div className="flex gap-2">
                  <select
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
                  >
                    <option value="">{t("kanban.selectFriend")}</option>
                    {available.map((f) => (
                      <option key={f.id} value={f.username ?? f.name}>{f.name}{f.username ? ` (@${f.username})` : ""}</option>
                    ))}
                  </select>
                  <select
                    value={invitePermission}
                    onChange={(e) => setInvitePermission(e.target.value)}
                    className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                  >
                    <option value="view">{t("kanban.permView")}</option>
                    <option value="edit">{t("kanban.permEdit")}</option>
                    <option value="admin">{t("kanban.permAdmin")}</option>
                  </select>
                  <Button size="sm" onClick={handleInviteMember} disabled={!inviteUsername.trim()}>{t("kanban.invite")}</Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t("kanban.noFriendsToInvite")}</p>
              );
            })()}

            {/* Owner */}
            {boardOwner && (
              <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
                <div>
                  <span className="text-sm font-medium">{boardOwner.username}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{t("kanban.owner")}</span>
                </div>
              </div>
            )}

            {/* Members list */}
            {membersLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : boardMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">{t("kanban.noMembers")}</p>
            ) : (
              <div className="space-y-1">
                {boardMembers.map((m) => (
                  <div key={m.userId} className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50">
                    <span className="text-sm font-medium">{m.username}</span>
                    <div className="flex items-center gap-2">
                      <select
                        value={m.permission}
                        onChange={(e) => handleUpdateMemberPermission(m.userId, e.target.value)}
                        className="rounded border border-input bg-background px-1.5 py-0.5 text-xs"
                      >
                        <option value="view">{t("kanban.permView")}</option>
                        <option value="edit">{t("kanban.permEdit")}</option>
                        <option value="admin">{t("kanban.permAdmin")}</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m.userId)}
                        className="rounded p-1 text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  // ── Layout ──────────────────────────────────

  return (
      <>
        <div className="flex h-full flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 pt-3 md:px-4 md:pt-4 pb-0">
            {boardSelector}
            <div className="flex items-center gap-1 md:gap-2">
              <div className="relative hidden md:block">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("kanban.search.placeholder")}
                  className="h-7 w-48 pl-7 pr-7 text-xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMobileSearchOpen((v) => !v)}
                className={`flex items-center rounded-md px-1.5 py-1.5 text-xs font-medium transition-colors md:hidden ${mobileSearchOpen ? "bg-brand/10 text-brand-text" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <Search className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setEditMode((v) => !v)}
                className={`flex items-center gap-1 md:gap-1.5 rounded-md px-1.5 md:px-2.5 py-1.5 text-xs font-medium transition-colors ${editMode ? "bg-brand/10 text-brand-text" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{t("kanban.editMode")}</span>
              </button>
              <button
                type="button"
                onClick={() => { setMembersOpen(true); fetchBoardMembers(); }}
                className="flex items-center gap-1 md:gap-1.5 rounded-md px-1.5 md:px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Users className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{t("kanban.members")}</span>
              </button>
              <Popover open={agentPermsOpen} onOpenChange={setAgentPermsOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleOpenAgentPerms()}
                    className="flex items-center gap-1 md:gap-1.5 rounded-md px-1.5 md:px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Bot className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">{t("kanban.agentAccess")}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-1" align="end" side="bottom">
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border mb-1">
                    {t("kanban.manageAgentAccess")}
                  </div>
                  {agentPermsLoading ? (
                    <div className="flex justify-center py-3">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    </div>
                  ) : allAgents.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">{t("kanban.noAgents")}</div>
                  ) : (
                    <>
                      {allAgents.map((ag) => (
                        <button
                          key={ag.id}
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                          onClick={() => handleToggleAgentPerm(ag.id)}
                        >
                          <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${selectedAgentIds.includes(ag.id) ? "bg-brand border-brand text-white" : "border-muted-foreground/30"}`}>
                            {selectedAgentIds.includes(ag.id) && <Check className="h-2.5 w-2.5" />}
                          </div>
                          <span className="truncate">{ag.name}</span>
                        </button>
                      ))}
                    </>
                  )}
                </PopoverContent>
              </Popover>
              <button
                type="button"
                onClick={() => setArchivedOpen(true)}
                className="flex items-center gap-1 md:gap-1.5 rounded-md px-1.5 md:px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Archive className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{t("kanban.archived")}</span>
              </button>
            </div>
          </div>

          {/* Mobile search bar */}
          {mobileSearchOpen && (
            <div className="relative px-3 pt-2 md:hidden">
              <Search className="absolute left-5 top-1/2 -translate-y-1/4 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("kanban.search.placeholder")}
                className="h-7 w-full pl-7 pr-7 text-xs"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-5 top-1/2 -translate-y-1/4 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

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
          cardLabels={selectedCard ? (cardLabelsMap.get(selectedCard.id) ?? []) : []}
          boardLabels={boardLabels}
          boardId={selectedBoardId ?? undefined}
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
            archivedBoards={archivedBoards}
            onUnarchiveBoard={handleUnarchiveBoard}
          />
        )}

        {boardDialogs}
      </>
    );
}
