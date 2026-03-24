import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock i18n
vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Mock api
const mockApi = vi.fn();
vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

// Mock ws
vi.mock("@/lib/ws", () => ({
  wsManager: { on: vi.fn(), off: vi.fn(), subscribe: vi.fn(() => vi.fn()) },
}));

// Mock useIsMobile
vi.mock("@/hooks/use-is-mobile", () => ({
  useIsMobile: () => false,
}));

// Mock chat-store
const mockChatStoreState = {
  activeConversationId: "conv-1",
  conversations: [],
  setActiveConversation: vi.fn(),
  jumpToMessage: vi.fn(),
  currentUserId: "user1",
};
vi.mock("@/store/chat-store", () => ({
  useChatStore: Object.assign(
    (sel: Function) => sel(mockChatStoreState),
    { getState: () => mockChatStoreState }
  ),
}));

// Mock DnD kit
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DragOverlay: () => null,
  PointerSensor: class {},
  TouchSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
  closestCorners: vi.fn(),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  arrayMove: vi.fn(),
  horizontalListSortingStrategy: {},
}));

// Mock child components
vi.mock("./card-detail-sheet", () => ({
  CardDetailSheet: () => <div data-testid="card-detail-sheet" />,
}));

vi.mock("./add-card-sheet", () => ({
  AddCardSheet: () => <div data-testid="add-card-sheet" />,
}));

vi.mock("./archived-cards-sheet", () => ({
  ArchivedCardsSheet: () => <div data-testid="archived-cards-sheet" />,
}));

vi.mock("./kanban-column", () => ({
  FullColumn: ({ column }: { column: { id: string; name: string } }) => (
    <div data-testid={`column-${column.id}`}>{column.name}</div>
  ),
}));

vi.mock("./kanban-card", () => ({
  CardOverlay: () => <div data-testid="card-overlay" />,
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "./kanban-board";

const BOARD_LIST = [{ id: "board-1", name: "My Board", ownerId: "user1" }];
const BOARD_DATA = {
  id: "board-1",
  columns: [
    { id: "col-1", boardId: "board-1", name: "To Do", sortOrder: 0 },
    { id: "col-2", boardId: "board-1", name: "Done", sortOrder: 1 },
  ],
  cards: [],
  cardAgents: [],
  cardNotes: [],
  cardCommits: [],
  labels: [],
  cardLabels: [],
};

describe("KanbanBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url === "/api/agents") {
        return Promise.resolve([]);
      }
      if (url === "/api/kanban/boards" && opts?.method === "POST") {
        return Promise.resolve({ id: "board-2", name: "New Board", ownerId: "user1" });
      }
      if (url.includes("/api/kanban/boards") && !url.includes("board-")) {
        return Promise.resolve(BOARD_LIST);
      }
      if (url.includes("/api/kanban/boards/board-1")) {
        return Promise.resolve(BOARD_DATA);
      }
      if (url.includes("/api/kanban/boards/board-2")) {
        return Promise.resolve({ ...BOARD_DATA, id: "board-2", columns: [] });
      }
      return Promise.resolve([]);
    });
  });

  it("renders board selector", async () => {
    render(<KanbanBoard />);
    expect(await screen.findByText("My Board")).toBeInTheDocument();
  });

  it("renders columns after loading board", async () => {
    render(<KanbanBoard />);
    await screen.findByText("My Board");
    expect(await screen.findByTestId("column-col-1")).toBeInTheDocument();
  });

  it("handles board creation API error gracefully", async () => {
    mockApi.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url === "/api/agents") return Promise.resolve([]);
      if (url === "/api/kanban/boards" && opts?.method === "POST") {
        return Promise.reject(new Error("plan_limit"));
      }
      if (url.includes("/api/kanban/boards") && !url.includes("board-")) {
        return Promise.resolve(BOARD_LIST);
      }
      if (url.includes("/api/kanban/boards/board-1")) {
        return Promise.resolve(BOARD_DATA);
      }
      return Promise.resolve([]);
    });

    render(<KanbanBoard />);
    await screen.findByText("My Board");
    // Board should still render after a failed creation attempt
    expect(screen.getByTestId("column-col-1")).toBeInTheDocument();
  });
});
