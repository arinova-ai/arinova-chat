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

// Mock utils
vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
  isGroupLike: () => false,
}));

// Mock config
vi.mock("@/lib/config", () => ({
  assetUrl: (url: string) => url,
  BACKEND_URL: "http://localhost:21001",
}));

// Mock api
vi.mock("@/lib/api", () => ({
  api: vi.fn().mockResolvedValue({}),
}));

// Mock chat-diagnostics
vi.mock("@/lib/chat-diagnostics", () => ({
  useRenderDiag: vi.fn(),
}));

// Mock right-panel-store
const mockRightPanelState = { panel: null, openPanel: vi.fn(), closePanel: vi.fn(), setActiveTab: vi.fn() };
vi.mock("@/store/right-panel-store", () => ({
  useRightPanelStore: Object.assign(
    (sel: Function) => sel(mockRightPanelState),
    { getState: () => mockRightPanelState }
  ),
}));

import { ChatArea } from "./chat-area";

// Build mock store state
let mockStoreState: Record<string, unknown> = {};

vi.mock("@/store/chat-store", () => ({
  useChatStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector(mockStoreState),
    {
      getState: () => mockStoreState,
    }
  ),
}));

vi.mock("@/store/voice-call-store", () => ({
  useVoiceCallStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ callState: "idle", conversationId: null }),
}));

vi.mock("./chat-header", () => ({
  ChatHeader: ({ agentName }: { agentName: string }) => (
    <div data-testid="chat-header">{agentName}</div>
  ),
}));

vi.mock("./message-list", () => ({
  MessageList: ({
    messages,
  }: {
    messages: { id: string; content: string }[];
  }) => (
    <div data-testid="message-list">
      {messages.map((m) => (
        <div key={m.id}>{m.content}</div>
      ))}
    </div>
  ),
}));

vi.mock("./chat-input", () => ({
  ChatInput: () => <div data-testid="chat-input" />,
}));

vi.mock("./empty-state", () => ({
  EmptyState: () => <div data-testid="empty-state" />,
}));

vi.mock("./search-results", () => ({
  SearchResults: () => <div data-testid="search-results" />,
}));

vi.mock("./bot-manage-dialog", () => ({
  BotManageDialog: () => null,
}));

vi.mock("./sticker-panel", () => ({
  StickerPanel: () => null,
}));

vi.mock("./notebook-list", () => ({
  NotebookList: () => null,
}));

vi.mock("./kanban-sidebar", () => ({
  KanbanSidebar: () => null,
}));

vi.mock("./wiki-panel", () => ({
  WikiPanel: () => null,
}));

vi.mock("./group-members-panel", () => ({
  GroupMembersPanel: () => null,
}));

vi.mock("./add-member-sheet", () => ({
  AddMemberSheet: () => null,
}));

vi.mock("./thread-panel", () => ({
  ThreadPanel: () => null,
}));

vi.mock("./thread-list-sheet", () => ({
  ThreadListSheet: () => null,
}));

vi.mock("./media-files-panel", () => ({
  MediaFilesPanel: () => null,
}));

vi.mock("./pinned-messages-bar", () => ({
  PinnedMessagesBar: () => null,
}));

vi.mock("./error-boundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("./chat-card-detail-sheet", () => ({
  ChatCardDetailSheet: () => null,
}));

vi.mock("./chat-note-detail-sheet", () => ({
  ChatNoteDetailSheet: () => null,
}));

vi.mock("@/components/voice/active-call", () => ({
  ActiveCall: () => <div data-testid="active-call" />,
}));

function setStoreState(overrides: Partial<typeof mockStoreState> = {}) {
  mockStoreState = {
    activeConversationId: null,
    searchActive: false,
    conversations: [],
    messagesByConversation: {},
    agents: [],
    agentHealth: {},
    conversationMembers: {},
    notebookOpen: false,
    kanbanSidebarOpen: false,
    openNotebook: vi.fn(),
    closeNotebook: vi.fn(),
    openKanbanSidebar: vi.fn(),
    closeKanbanSidebar: vi.fn(),
    setAttachedCard: vi.fn(),
    ...overrides,
  };
}

describe("ChatArea", () => {
  beforeEach(() => {
    setStoreState();
    vi.clearAllMocks();
  });

  it("renders EmptyState when no active conversation", () => {
    setStoreState({ activeConversationId: null });
    render(<ChatArea />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("renders SearchResults when search is active", () => {
    setStoreState({ searchActive: true });
    render(<ChatArea />);
    expect(screen.getByTestId("search-results")).toBeInTheDocument();
  });

  it("renders EmptyState when conversation not found", () => {
    setStoreState({
      activeConversationId: "conv-missing",
      conversations: [],
    });
    render(<ChatArea />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("renders chat header, messages, and input when conversation is active", () => {
    setStoreState({
      activeConversationId: "conv-1",
      conversations: [
        {
          id: "conv-1",
          title: "Test",
          type: "h2a",
          userId: "u1",
          agentId: "a1",
          agentName: "CodeBot",
          agentDescription: "A coding bot",
          agentAvatarUrl: null,
          lastMessage: null,
          pinnedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      messagesByConversation: {
        "conv-1": [
          {
            id: "m1",
            conversationId: "conv-1",
            role: "user",
            content: "Hello",
            status: "delivered",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
      agents: [
        {
          id: "a1",
          name: "CodeBot",
          description: "A coding bot",
          avatarUrl: null,
        },
      ],
      agentHealth: { a1: { status: "online", latencyMs: 10 } },
    });
    render(<ChatArea />);
    expect(screen.getByTestId("chat-header")).toHaveTextContent("CodeBot");
    expect(screen.getByTestId("message-list")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByTestId("chat-input")).toBeInTheDocument();
  });

  it("renders empty message list when no messages", () => {
    setStoreState({
      activeConversationId: "conv-1",
      conversations: [
        {
          id: "conv-1",
          title: "Test",
          type: "h2a",
          userId: "u1",
          agentId: "a1",
          agentName: "CodeBot",
          agentDescription: null,
          agentAvatarUrl: null,
          lastMessage: null,
          pinnedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      messagesByConversation: {},
    });
    render(<ChatArea />);
    expect(screen.getByTestId("message-list")).toBeInTheDocument();
  });
});
