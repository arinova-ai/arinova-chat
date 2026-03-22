import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
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

// Mock i18n
vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Mock utils
vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

// Mock api
vi.mock("@/lib/api", () => ({
  api: vi.fn().mockResolvedValue({}),
}));

// Mock UI components
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: any) => <button {...props} />,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("@/components/ui/verified-badge", () => ({
  VerifiedBadge: () => null,
}));

vi.mock("@/lib/config", () => ({
  assetUrl: (url: string) => `http://localhost:21001${url}`,
  AGENT_DEFAULT_AVATAR: "/default-avatar.png",
  BACKEND_URL: "http://localhost:21001",
}));

describe("NewChatDialog", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders agent list when open", () => {
    render(<NewChatDialog open={true} onOpenChange={mockOnOpenChange} />);
    expect(screen.getByText("newChat.title")).toBeInTheDocument();
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
    expect(screen.getByText("newChat.createBot")).toBeInTheDocument();
    expect(screen.getByText("newChat.newGroup")).toBeInTheDocument();
  });

  it("loads agent health on open", () => {
    render(<NewChatDialog open={true} onOpenChange={mockOnOpenChange} />);
    expect(mockLoadAgentHealth).toHaveBeenCalled();
  });
});

