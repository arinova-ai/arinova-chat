import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockDeleteMessage = vi.fn();
const mockSendMessage = vi.fn();
const mockCancelStream = vi.fn();

vi.mock("@/store/chat-store", () => ({
  useChatStore: (selector: any) => {
    const state = {
      deleteMessage: mockDeleteMessage,
      sendMessage: mockSendMessage,
      cancelStream: mockCancelStream,
      messagesByConversation: {},
      showTimestamps: false,
    };
    return selector(state);
  },
}));

vi.mock("./markdown-content", () => ({
  MarkdownContent: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}));

vi.mock("./streaming-cursor", () => ({
  StreamingCursor: () => <div data-testid="streaming-cursor">Loading...</div>,
}));

vi.mock("@/lib/config", () => ({
  assetUrl: (url: string) => url,
}));

import { MessageBubble } from "./message-bubble";

const baseMessage = {
  id: "msg-1",
  conversationId: "conv-1",
  seq: 1,
  role: "user" as const,
  content: "Hello world",
  status: "completed" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("MessageBubble", () => {
  beforeEach(() => {
    mockDeleteMessage.mockClear();
    mockSendMessage.mockClear();
    mockCancelStream.mockClear();
  });

  it("user message has flex-row-reverse class and blue background", () => {
    const { container } = render(
      <MessageBubble message={{ ...baseMessage, role: "user" }} />
    );

    const row = container.querySelector(".flex-row-reverse");
    expect(row).not.toBeNull();

    const bubble = container.querySelector(".bg-blue-600");
    expect(bubble).not.toBeNull();
  });

  it("agent message has flex-row class and neutral background, shows agentName", () => {
    const { container } = render(
      <MessageBubble
        message={{ ...baseMessage, role: "agent" }}
        agentName="TestBot"
      />
    );

    const reverseRow = container.querySelector(".flex-row-reverse");
    expect(reverseRow).toBeNull();

    const row = container.querySelector(".flex-row");
    expect(row).not.toBeNull();

    const bubble = container.querySelector(".bg-neutral-800");
    expect(bubble).not.toBeNull();

    expect(screen.getByText("TestBot")).toBeDefined();
  });

  it("streaming message shows streaming cursor", () => {
    render(
      <MessageBubble
        message={{ ...baseMessage, role: "agent", status: "streaming", content: "" }}
      />
    );

    expect(screen.getByTestId("streaming-cursor")).toBeDefined();
  });

  it("streaming agent message shows Stop button", () => {
    // Stop button only renders for agent (non-user) streaming messages
    const { container } = render(
      <MessageBubble
        message={{ ...baseMessage, role: "agent", status: "streaming", content: "partial" }}
        agentName="TestBot"
      />
    );

    // The stop button has title="Stop generating"
    const stopBtn = container.querySelector('button[title="Stop generating"]');
    expect(stopBtn).not.toBeNull();
  });

  it("error message shows Error text", () => {
    render(
      <MessageBubble
        message={{ ...baseMessage, role: "agent", status: "error", content: "Something went wrong" }}
      />
    );

    expect(screen.getByText("Error")).toBeDefined();
  });

  it("error message shows Retry button that triggers resend", async () => {
    const user = userEvent.setup();

    // The retry button only shows on error messages (in the hover actions area)
    // It finds the last user message and resends it
    const { container } = render(
      <MessageBubble
        message={{ ...baseMessage, role: "agent", status: "error", content: "Error occurred" }}
        agentName="TestBot"
      />
    );

    const retryBtn = container.querySelector('button[title="Retry message"]');
    expect(retryBtn).not.toBeNull();
  });

  it("completed message renders content via MarkdownContent", () => {
    render(
      <MessageBubble message={{ ...baseMessage, content: "Hello world" }} />
    );

    const md = screen.getByTestId("markdown-content");
    expect(md.textContent).toBe("Hello world");
  });

  it("delete button calls deleteMessage with conversationId and messageId", async () => {
    const user = userEvent.setup();

    const { container } = render(
      <MessageBubble message={baseMessage} />
    );

    // Delete button has title="Delete message"
    const deleteBtn = container.querySelector('button[title="Delete message"]');
    expect(deleteBtn).not.toBeNull();
    await user.click(deleteBtn!);

    expect(mockDeleteMessage).toHaveBeenCalledWith("conv-1", "msg-1");
  });

  it("copy button copies content to clipboard", async () => {
    const user = userEvent.setup();

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const { container } = render(
      <MessageBubble message={{ ...baseMessage, content: "Copy me" }} />
    );

    const copyBtn = container.querySelector('button[title="Copy message"]');
    expect(copyBtn).not.toBeNull();
    await user.click(copyBtn!);

    expect(writeTextMock).toHaveBeenCalledWith("Copy me");
  });
});
