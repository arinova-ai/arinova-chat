import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatArea } from "./chat-area";

// Build mock store state
let mockStoreState: Record<string, unknown> = {};

vi.mock("@/store/chat-store", () => ({
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector(mockStoreState),
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
          type: "direct",
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
          type: "direct",
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
