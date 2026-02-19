import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "./sidebar";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock auth-client
vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: vi.fn().mockResolvedValue(undefined) },
}));

// Mock store
const mockSearchMessages = vi.fn();
vi.mock("@/store/chat-store", () => ({
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      searchMessages: mockSearchMessages,
      searchQuery: "",
    }),
}));

// Mock child components
vi.mock("./conversation-list", () => ({
  ConversationList: () => <div data-testid="conversation-list" />,
}));

vi.mock("./new-chat-dialog", () => ({
  NewChatDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="new-chat-dialog" /> : null,
  CreateBotDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-bot-dialog" /> : null,
}));

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the app title", () => {
    render(<Sidebar />);
    expect(screen.getByText("Arinova Chat")).toBeInTheDocument();
  });

  it("renders the search input", () => {
    render(<Sidebar />);
    expect(
      screen.getByPlaceholderText("Search messages...")
    ).toBeInTheDocument();
  });

  it("renders the conversation list", () => {
    render(<Sidebar />);
    expect(screen.getByTestId("conversation-list")).toBeInTheDocument();
  });

  it("renders New Chat, Apps, Create Bot, and Sign Out buttons", () => {
    render(<Sidebar />);
    expect(screen.getByText("New Chat")).toBeInTheDocument();
    expect(screen.getByText("Apps")).toBeInTheDocument();
    expect(screen.getByText("Create Bot")).toBeInTheDocument();
    expect(screen.getByText("Sign Out")).toBeInTheDocument();
  });

  it("opens NewChatDialog when New Chat clicked", () => {
    render(<Sidebar />);
    expect(screen.queryByTestId("new-chat-dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("New Chat"));
    expect(screen.getByTestId("new-chat-dialog")).toBeInTheDocument();
  });

  it("opens CreateBotDialog when Create Bot clicked", () => {
    render(<Sidebar />);
    expect(screen.queryByTestId("create-bot-dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Create Bot"));
    expect(screen.getByTestId("create-bot-dialog")).toBeInTheDocument();
  });

  it("navigates to /apps when Apps clicked", () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByText("Apps"));
    expect(mockPush).toHaveBeenCalledWith("/apps");
  });

  it("navigates to /settings when settings button clicked", () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByTitle("Settings"));
    expect(mockPush).toHaveBeenCalledWith("/settings");
  });

  it("triggers search on Enter key", () => {
    render(<Sidebar />);
    const input = screen.getByPlaceholderText("Search messages...");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockSearchMessages).toHaveBeenCalledWith("hello");
  });

  it("does not search on Enter when query is empty", () => {
    render(<Sidebar />);
    const input = screen.getByPlaceholderText("Search messages...");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockSearchMessages).not.toHaveBeenCalled();
  });

  it("signs out and redirects to /login", async () => {
    const { authClient } = await import("@/lib/auth-client");
    render(<Sidebar />);
    fireEvent.click(screen.getByText("Sign Out"));
    expect(authClient.signOut).toHaveBeenCalled();
  });
});
