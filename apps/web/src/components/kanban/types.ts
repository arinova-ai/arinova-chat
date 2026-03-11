// ── Shared Kanban types ─────────────────────────────────────

export interface KanbanColumn {
  id: string;
  boardId: string;
  name: string;
  sortOrder: number;
}

export interface KanbanCard {
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

export interface CardAgent {
  cardId: string;
  agentId: string;
}

export interface CardNote {
  cardId: string;
  noteId: string;
  noteTitle: string;
}

export interface CardCommit {
  cardId: string;
  commitHash: string;
  message?: string | null;
  createdAt?: string | null;
}

export interface BoardData {
  id: string;
  columns: KanbanColumn[];
  cards: KanbanCard[];
  cardAgents: CardAgent[];
  cardNotes: CardNote[];
  cardCommits: CardCommit[];
}

// ── Priority helpers ────────────────────────────────────────

export const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: "Low", color: "text-slate-400", bg: "bg-slate-500/15" },
  medium: { label: "Medium", color: "text-blue-400", bg: "bg-blue-500/15" },
  high: { label: "High", color: "text-orange-400", bg: "bg-orange-500/15" },
  urgent: { label: "Urgent", color: "text-red-400", bg: "bg-red-500/15" },
};

export const PRIORITY_BORDER: Record<string, string> = {
  urgent: "border-l-red-500",
  high: "border-l-orange-500",
  medium: "border-l-yellow-500",
  low: "border-l-green-500",
};

export function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso ?? "—";
  }
}
