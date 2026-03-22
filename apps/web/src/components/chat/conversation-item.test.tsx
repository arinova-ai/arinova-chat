import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/store/chat-store", () => ({
  useChatStore: vi.fn(() => ({})),
}));

// Mock assetUrl from config so it doesn't hit real URLs
vi.mock("@/lib/config", () => ({
  assetUrl: (url: string) => url,
  BACKEND_URL: "http://localhost:21001",
  WS_URL: "ws://localhost:21001/ws",
  AGENT_DEFAULT_AVATAR: "/default-avatar.png",
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

// Mock UI components
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  AvatarFallback: ({ children }: any) => <span>{children}</span>,
  AvatarImage: () => <img />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: any) => <button {...props} />,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: any) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: any) => <div>{children}</div>,
  ContextMenuContent: ({ children }: any) => <div>{children}</div>,
  ContextMenuItem: ({ children }: any) => <div>{children}</div>,
  ContextMenuSeparator: () => <hr />,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: any) => <div>{children}</div>,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/verified-badge", () => ({
  VerifiedBadge: () => null,
}));

import { ConversationItem } from "./conversation-item";

const defaultProps = {
  id: "conv-1",
  title: "Test Conversation",
  agentName: "TestBot",
  agentAvatarUrl: null,
  type: "h2a" as const,
  lastMessage: null,
  pinnedAt: null,
  updatedAt: new Date(),
  isActive: false,
  onClick: vi.fn(),
  onRename: vi.fn(),
  onPin: vi.fn(),
  onDelete: vi.fn(),
};

describe("ConversationItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders conversation title", () => {
    render(<ConversationItem {...defaultProps} />);
    expect(screen.getByText("Test Conversation")).toBeInTheDocument();
  });

  it("renders agent name as fallback when no title is set", () => {
    render(<ConversationItem {...defaultProps} title={null} />);
    expect(screen.getByText("TestBot")).toBeInTheDocument();
  });

  it("renders last message preview when lastMessage is provided", () => {
    const props = {
      ...defaultProps,
      lastMessage: {
        id: "msg-1",
        conversationId: "conv-1",
        seq: 1,
        role: "agent" as const,
        content: "Hello there!",
        status: "completed" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
    render(<ConversationItem {...props} />);
    expect(screen.getByText("Hello there!")).toBeInTheDocument();
  });

  it("shows 'No messages yet' when lastMessage is null", () => {
    render(<ConversationItem {...defaultProps} lastMessage={null} />);
    expect(screen.getByText("chat.noMessages")).toBeInTheDocument();
  });

  it("calls onClick when the main button is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ConversationItem {...defaultProps} onClick={onClick} />);

    const button = screen.getByRole("button", { name: /test conversation/i });
    await user.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows unread badge with count when unreadCount > 0", () => {
    render(<ConversationItem {...defaultProps} unreadCount={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows '99+' when unreadCount > 99", () => {
    render(<ConversationItem {...defaultProps} unreadCount={100} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("shows '99+' for exactly 100 unread messages", () => {
    render(<ConversationItem {...defaultProps} unreadCount={100} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("does not show unread badge when unreadCount is 0", () => {
    render(<ConversationItem {...defaultProps} unreadCount={0} />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows online indicator when isOnline is true", () => {
    const { container } = render(
      <ConversationItem {...defaultProps} isOnline={true} />
    );
    // The online indicator is a span with bg-green-500
    const onlineIndicator = container.querySelector(".bg-green-500");
    expect(onlineIndicator).toBeInTheDocument();
  });

  it("does not show online indicator when isOnline is false", () => {
    const { container } = render(
      <ConversationItem {...defaultProps} isOnline={false} />
    );
    const onlineIndicator = container.querySelector(".bg-green-500");
    expect(onlineIndicator).not.toBeInTheDocument();
  });

  it("applies active styles when isActive is true", () => {
    const { container } = render(
      <ConversationItem {...defaultProps} isActive={true} />
    );
    // Active styles should be present somewhere in the rendered output
    expect(container.innerHTML).toContain("bg-accent");
  });

  it("shows thinking text when isThinking is true", () => {
    render(<ConversationItem {...defaultProps} isThinking={true} />);
    expect(screen.getByText("chat.thinking")).toBeInTheDocument();
  });
});
