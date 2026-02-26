import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewChatDialog } from "./new-chat-dialog";

// Mock store
const mockCreateConversation = vi.fn().mockResolvedValue({ id: "conv-new" });
const mockCreateGroupConversation = vi
  .fn()
  .mockResolvedValue({ id: "conv-group" });
const mockSetActiveConversation = vi.fn();
const mockLoadAgentHealth = vi.fn();
const mockCreateAgent = vi.fn().mockResolvedValue({
  id: "agent-new",
  name: "TestBot",
  secretToken: "secret-123",
});

const mockAgents = [
  {
    id: "a1",
    name: "CodeBot",
    description: "A coding bot",
    avatarUrl: null,
    a2aEndpoint: null,
    secretToken: null,
    ownerId: "u1",
    isPublic: false,
    category: null,
    usageCount: 0,
    systemPrompt: null,
    welcomeMessage: null,
    quickReplies: null,
    voiceCapable: false,
    notificationsEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "a2",
    name: "HelperBot",
    description: "Helpful assistant",
    avatarUrl: null,
    a2aEndpoint: null,
    secretToken: null,
    ownerId: "u1",
    isPublic: false,
    category: null,
    usageCount: 0,
    systemPrompt: null,
    welcomeMessage: null,
    quickReplies: null,
    voiceCapable: false,
    notificationsEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

vi.mock("@/store/chat-store", () => ({
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      agents: mockAgents,
      createConversation: mockCreateConversation,
      createGroupConversation: mockCreateGroupConversation,
      setActiveConversation: mockSetActiveConversation,
      agentHealth: { a1: { status: "online", latencyMs: 10 } },
      loadAgentHealth: mockLoadAgentHealth,
      createAgent: mockCreateAgent,
    }),
}));

vi.mock("./bot-manage-dialog", () => ({
  BotManageDialog: () => null,
}));

vi.mock("@/lib/config", () => ({
  assetUrl: (url: string) => `http://localhost:21001${url}`,
}));

describe("NewChatDialog", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders agent list when open", () => {
    render(<NewChatDialog open={true} onOpenChange={mockOnOpenChange} />);
    expect(screen.getByText("New Conversation")).toBeInTheDocument();
    expect(screen.getByText("CodeBot")).toBeInTheDocument();
    expect(screen.getByText("HelperBot")).toBeInTheDocument();
  });

  it("shows agent descriptions", () => {
    render(<NewChatDialog open={true} onOpenChange={mockOnOpenChange} />);
    expect(screen.getByText("A coding bot")).toBeInTheDocument();
    expect(screen.getByText("Helpful assistant")).toBeInTheDocument();
  });

  it("creates conversation when agent is selected", async () => {
    render(<NewChatDialog open={true} onOpenChange={mockOnOpenChange} />);
    fireEvent.click(screen.getByText("CodeBot"));
    await waitFor(() => {
      expect(mockCreateConversation).toHaveBeenCalledWith("a1");
    });
    expect(mockSetActiveConversation).toHaveBeenCalledWith("conv-new");
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows Create Bot and New Group buttons", () => {
    render(<NewChatDialog open={true} onOpenChange={mockOnOpenChange} />);
    expect(screen.getByText("Create Bot")).toBeInTheDocument();
    expect(screen.getByText("New Group")).toBeInTheDocument();
  });

  it("loads agent health on open", () => {
    render(<NewChatDialog open={true} onOpenChange={mockOnOpenChange} />);
    expect(mockLoadAgentHealth).toHaveBeenCalled();
  });
});

