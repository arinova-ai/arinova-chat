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
  wsManager: { on: vi.fn(), off: vi.fn() },
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

import { KanbanBoard } from "./kanban-board";

describe("KanbanBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.mockImplementation((url: string) => {
      if (url === "/api/agents") {
        return Promise.resolve([]);
      }
      if (url.includes("/api/kanban/boards") && !url.includes("board-")) {
        return Promise.resolve([
          { id: "board-1", name: "My Board", ownerId: "user1" },
        ]);
      }
      if (url.includes("/api/kanban/boards/board-1")) {
        return Promise.resolve({
          columns: [
            { id: "col-1", name: "To Do", position: 0, cards: [] },
            { id: "col-2", name: "Done", position: 1, cards: [] },
          ],
        });
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
});
