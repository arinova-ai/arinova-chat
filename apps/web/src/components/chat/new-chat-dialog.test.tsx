import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewChatDialog, CreateBotDialog } from "./new-chat-dialog";

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
  assetUrl: (url: string) => `http://localhost:3501${url}`,
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

describe("CreateBotDialog", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders bot creation form when open", () => {
    render(
      <CreateBotDialog open={true} onOpenChange={mockOnOpenChange} />
    );
    // Title and submit button both say "Create Bot"
    expect(screen.getAllByText("Create Bot").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByPlaceholderText("e.g. CodeBot")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("What does this agent do?")
    ).toBeInTheDocument();
  });

  it("shows name field as required", () => {
    render(
      <CreateBotDialog open={true} onOpenChange={mockOnOpenChange} />
    );
    const nameInput = screen.getByPlaceholderText("e.g. CodeBot");
    expect(nameInput).toBeRequired();
  });

  it("submits form and shows success state", async () => {
    render(
      <CreateBotDialog open={true} onOpenChange={mockOnOpenChange} />
    );
    const nameInput = screen.getByPlaceholderText("e.g. CodeBot");
    fireEvent.change(nameInput, { target: { value: "TestBot" } });

    const descInput = screen.getByPlaceholderText("What does this agent do?");
    fireEvent.change(descInput, { target: { value: "A test bot" } });

    // Find and submit the form
    const submitButton = screen.getByRole("button", { name: "Create Bot" });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockCreateAgent).toHaveBeenCalledWith({
        name: "TestBot",
        description: "A test bot",
        a2aEndpoint: undefined,
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Bot Created")).toBeInTheDocument();
    });
  });

  it("shows error on failed submission", async () => {
    mockCreateAgent.mockRejectedValueOnce(new Error("Name taken"));
    render(
      <CreateBotDialog open={true} onOpenChange={mockOnOpenChange} />
    );
    fireEvent.change(screen.getByPlaceholderText("e.g. CodeBot"), {
      target: { value: "TestBot" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Bot" }));

    await waitFor(() => {
      expect(screen.getByText("Name taken")).toBeInTheDocument();
    });
  });

  it("toggles advanced endpoint field", () => {
    render(
      <CreateBotDialog open={true} onOpenChange={mockOnOpenChange} />
    );
    expect(
      screen.queryByPlaceholderText(
        "https://agent.example.com/.well-known/agent.json"
      )
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByText("Advanced: Connect existing agent")
    );

    expect(
      screen.getByPlaceholderText(
        "https://agent.example.com/.well-known/agent.json"
      )
    ).toBeInTheDocument();
  });
});
