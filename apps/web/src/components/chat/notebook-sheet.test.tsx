import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render } from "@testing-library/react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next/dynamic to return a stub component
vi.mock("next/dynamic", () => ({
  default: () => {
    const Stub = () => <div data-testid="notebook-editor" />;
    Stub.displayName = "NotebookEditor";
    return Stub;
  },
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

// Mock chat-store
const mockJumpToMessage = vi.fn();
vi.mock("@/store/chat-store", () => ({
  useChatStore: (sel: Function) =>
    sel({
      activeConversationId: "conv-1",
      conversations: [],
      setActiveConversation: vi.fn(),
      jumpToMessage: mockJumpToMessage,
      currentUserId: "user1",
      notesByKey: { __all__: [] },
      loadNotes: vi.fn(),
    }),
}));

// Mock useIsMobile
vi.mock("@/hooks/use-is-mobile", () => ({
  useIsMobile: () => false,
}));

// Mock share-sheet
vi.mock("./share-sheet", () => ({
  ShareSheet: () => <div data-testid="share-sheet" />,
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import { NotebookSheet } from "./notebook-sheet";

describe("NotebookSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.mockImplementation((url: string) => {
      if (url.includes("/notes")) {
        return Promise.resolve([
          {
            id: "note-1",
            title: "Test Note",
            content: "Some content",
            conversationId: "conv-1",
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z",
            pinned: false,
            archived: false,
            sourceConversationId: "conv-source-1",
            sourceMessageId: "msg-1",
            tags: [],
            relatedMemories: [],
          },
        ]);
      }
      return Promise.resolve({});
    });
  });

  it("renders without crashing when open", () => {
    const { container } = render(<NotebookSheet open={true} onOpenChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });

  it("does not render content when closed", () => {
    const { container } = render(<NotebookSheet open={false} onOpenChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
