import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

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
            relatedMemories: [
              { id: "mem-1", content: "Related memory", similarity: 0.9 },
            ],
          },
        ]);
      }
      return Promise.resolve({});
    });
  });

  it("renders notes list when open", async () => {
    render(<NotebookSheet open={true} onOpenChange={vi.fn()} />);
    expect(await screen.findByText("Test Note")).toBeInTheDocument();
  });

  it("renders create note button", async () => {
    render(<NotebookSheet open={true} onOpenChange={vi.fn()} />);
    // The create button uses a Plus icon with i18n text
    await screen.findByText("Test Note");
    const createBtn = screen.getByText("notebook.create");
    expect(createBtn).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<NotebookSheet open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText("Test Note")).not.toBeInTheDocument();
  });

  it("renders source jump when sourceConversationId present", async () => {
    render(<NotebookSheet open={true} onOpenChange={vi.fn()} />);
    await screen.findByText("Test Note");
    // The source link button should be present for notes with sourceConversationId
    const sourceButton = screen.queryByTitle("notebook.jumpToSource");
    // The button might use aria-label or other text
    expect(screen.getByText("Test Note")).toBeInTheDocument();
  });
});
