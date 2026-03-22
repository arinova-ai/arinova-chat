import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock i18n
vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
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

vi.mock("@/components/ui/page-title", () => ({
  PageTitle: ({ title }: { title: string }) => <div data-testid="page-title">{title}</div>,
}));

vi.mock("@/components/accounts/account-switcher", () => ({
  AccountSwitcher: () => <div data-testid="account-switcher" />,
}));

import { Sidebar } from "./sidebar";

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page title", () => {
    render(<Sidebar />);
    expect(screen.getByTestId("page-title")).toHaveTextContent("nav.chat");
  });

  it("renders the search input", () => {
    render(<Sidebar />);
    expect(
      screen.getByPlaceholderText("chat.searchPlaceholder")
    ).toBeInTheDocument();
  });

  it("renders the conversation list", () => {
    render(<Sidebar />);
    expect(screen.getByTestId("conversation-list")).toBeInTheDocument();
  });

  it("triggers search on Enter key", () => {
    render(<Sidebar />);
    const input = screen.getByPlaceholderText("chat.searchPlaceholder");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockSearchMessages).toHaveBeenCalledWith("hello");
  });

  it("does not search on Enter when query is empty", () => {
    render(<Sidebar />);
    const input = screen.getByPlaceholderText("chat.searchPlaceholder");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockSearchMessages).not.toHaveBeenCalled();
  });

  it("hides search when collapsed", () => {
    render(<Sidebar collapsed={true} />);
    expect(screen.queryByPlaceholderText("chat.searchPlaceholder")).not.toBeInTheDocument();
  });
});
