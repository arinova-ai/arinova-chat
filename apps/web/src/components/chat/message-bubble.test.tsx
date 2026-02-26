import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageBubble } from "./message-bubble";
import type { Message } from "@arinova/shared/types";

// Mock zustand store
const mockDeleteMessage = vi.fn();
const mockSendMessage = vi.fn();
const mockCancelStream = vi.fn();

vi.mock("@/store/chat-store", () => ({
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      deleteMessage: mockDeleteMessage,
      sendMessage: mockSendMessage,
      cancelStream: mockCancelStream,
      messagesByConversation: {},
      showTimestamps: false,
    }),
}));

vi.mock("./markdown-content", () => ({
  MarkdownContent: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}));

vi.mock("./streaming-cursor", () => ({
  StreamingCursor: () => <span data-testid="streaming-cursor" />,
}));

vi.mock("@/lib/config", () => ({
  assetUrl: (url: string) => `http://localhost:21001${url}`,
}));

function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    seq: 1,
    role: "agent",
    content: "Hello world",
    status: "completed",
    createdAt: new Date("2025-01-01T12:00:00Z"),
    updatedAt: new Date("2025-01-01T12:00:00Z"),
    ...overrides,
  };
}

describe("MessageBubble", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders agent message with markdown content", () => {
    render(<MessageBubble message={createMessage()} />);
    expect(screen.getByTestId("markdown-content")).toHaveTextContent(
      "Hello world"
    );
  });

  it("renders user message with reversed layout", () => {
    render(
      <MessageBubble message={createMessage({ role: "user" })} />
    );
    const container = screen.getByTestId("markdown-content").closest(".group");
    expect(container).toHaveClass("flex-row-reverse");
  });

  it("shows agent name for non-user messages", () => {
    render(
      <MessageBubble message={createMessage()} agentName="CodeBot" />
    );
    expect(screen.getByText("CodeBot")).toBeInTheDocument();
  });

  it("does not show agent name for user messages", () => {
    render(
      <MessageBubble
        message={createMessage({ role: "user" })}
        agentName="CodeBot"
      />
    );
    expect(screen.queryByText("CodeBot")).not.toBeInTheDocument();
  });

  it("shows streaming cursor when status is streaming", () => {
    render(
      <MessageBubble
        message={createMessage({ status: "streaming", content: "" })}
      />
    );
    expect(screen.getByTestId("streaming-cursor")).toBeInTheDocument();
  });

  it("shows streaming cursor alongside content when streaming", () => {
    render(
      <MessageBubble
        message={createMessage({ status: "streaming", content: "partial" })}
      />
    );
    expect(screen.getByTestId("markdown-content")).toHaveTextContent("partial");
    expect(screen.getByTestId("streaming-cursor")).toBeInTheDocument();
  });

  it("shows error indicator for error messages", () => {
    render(
      <MessageBubble message={createMessage({ status: "error" })} />
    );
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("shows retry button for error messages", () => {
    render(
      <MessageBubble message={createMessage({ status: "error" })} />
    );
    expect(screen.getByTitle("Retry message")).toBeInTheDocument();
  });

  it("shows stop button when streaming (agent)", () => {
    render(
      <MessageBubble
        message={createMessage({ status: "streaming", content: "text" })}
      />
    );
    expect(screen.getByTitle("Stop generating")).toBeInTheDocument();
  });

  it("calls cancelStream when stop button clicked", () => {
    render(
      <MessageBubble
        message={createMessage({ status: "streaming", content: "text" })}
      />
    );
    fireEvent.click(screen.getByTitle("Stop generating"));
    expect(mockCancelStream).toHaveBeenCalled();
  });

  it("shows copy and delete buttons (hover actions)", () => {
    render(<MessageBubble message={createMessage()} />);
    expect(screen.getByTitle("Copy message")).toBeInTheDocument();
    expect(screen.getByTitle("Delete message")).toBeInTheDocument();
  });

  it("calls deleteMessage when delete button clicked", () => {
    render(<MessageBubble message={createMessage()} />);
    fireEvent.click(screen.getByTitle("Delete message"));
    expect(mockDeleteMessage).toHaveBeenCalledWith("conv-1", "msg-1");
  });

  it("renders image attachments", () => {
    render(
      <MessageBubble
        message={createMessage({
          attachments: [
            {
              id: "att-1",
              messageId: "msg-1",
              fileName: "photo.png",
              fileType: "image/png",
              fileSize: 1024,
              url: "/uploads/photo.png",
              createdAt: new Date(),
            },
          ],
        })}
      />
    );
    const img = screen.getByAltText("photo.png");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute(
      "src",
      "http://localhost:21001/uploads/photo.png"
    );
  });

  it("renders file attachments with download link", () => {
    render(
      <MessageBubble
        message={createMessage({
          attachments: [
            {
              id: "att-2",
              messageId: "msg-1",
              fileName: "doc.pdf",
              fileType: "application/pdf",
              fileSize: 2048,
              url: "/uploads/doc.pdf",
              createdAt: new Date(),
            },
          ],
        })}
      />
    );
    expect(screen.getByText("doc.pdf")).toBeInTheDocument();
  });

  it("does not show hover actions while streaming", () => {
    render(
      <MessageBubble
        message={createMessage({ status: "streaming", content: "text" })}
      />
    );
    expect(screen.queryByTitle("Copy message")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Delete message")).not.toBeInTheDocument();
  });
});
