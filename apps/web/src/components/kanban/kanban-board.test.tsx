import { describe, it, expect, vi, beforeEach } from "vitest";
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
vi.mock("@/store/chat-store", () => ({
  useChatStore: (sel: Function) =>
    sel({
      activeConversationId: "conv-1",
      conversations: [],
      setActiveConversation: vi.fn(),
      jumpToMessage: vi.fn(),
      currentUserId: "user1",
    }),
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
    // Default: return boards list and board data
    mockApi.mockImplementation((url: string) => {
      if (url === "/api/agents") {
        return Promise.resolve([]);
      }
      if (url.includes("/api/kanban/boards") && !url.includes("/")) {
        return Promise.resolve([
          { id: "board-1", name: "My Board", ownerId: "user1" },
          { id: "board-2", name: "Shared Board", ownerId: "other-user", ownerUsername: "alice" },
        ]);
      }
      if (url.includes("/api/kanban/boards/board-1")) {
        return Promise.resolve({
          columns: [
            { id: "col-1", name: "To Do", position: 0, cards: [{ id: "card-1", title: "Task 1", columnId: "col-1", position: 0 }] },
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

  it("renders card list after loading board", async () => {
    render(<KanbanBoard />);
    await screen.findByText("My Board");
    // Board columns render via FullColumn mock
    expect(await screen.findByTestId("column-col-1")).toBeInTheDocument();
  });

  it("renders create card button", async () => {
    render(<KanbanBoard />);
    await screen.findByText("My Board");
    // The add card button uses i18n key
    const addBtn = screen.getByText("kanban.addCard");
    expect(addBtn).toBeInTheDocument();
  });

  it("shows shared board with owner tag", async () => {
    render(<KanbanBoard />);
    // The shared board should display owner info
    expect(await screen.findByText("Shared Board")).toBeInTheDocument();
    expect(screen.getByText(/alice/)).toBeInTheDocument();
  });
});
