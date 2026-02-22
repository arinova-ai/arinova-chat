import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSendMessage = vi.fn();
const mockLoadAgentSkills = vi.fn();

vi.mock("@/store/chat-store", () => ({
  useChatStore: (selector: any) => {
    const state = {
      sendMessage: mockSendMessage,
      activeConversationId: "conv-1",
      conversations: [
        {
          id: "conv-1",
          type: "direct",
          agentId: "agent-1",
          agentName: "TestBot",
        },
      ],
      agents: [
        {
          id: "agent-1",
          name: "TestBot",
          quickReplies: null,
        },
      ],
      agentSkills: {},
      loadAgentSkills: mockLoadAgentSkills,
    };
    return selector(state);
  },
}));

vi.mock("@/lib/api", () => ({
  api: vi.fn(),
}));

import { ChatInput } from "./chat-input";

describe("ChatInput", () => {
  beforeEach(() => {
    mockSendMessage.mockClear();
    mockLoadAgentSkills.mockClear();
  });

  it('renders textarea with placeholder "Type a message..."', () => {
    render(<ChatInput />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    expect(textarea).toBeDefined();
  });

  it("send button is present", () => {
    render(<ChatInput />);

    // Send button with ArrowUp icon — look for a button element
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("send button is disabled when textarea is empty", () => {
    render(<ChatInput />);

    // The send button should be disabled when there is no text
    // Find it by its disabled state — it is the only or primary submit button
    const buttons = screen.getAllByRole("button");
    const sendButton = buttons.find(
      (btn) => (btn as HTMLButtonElement).disabled
    );
    expect(sendButton).toBeDefined();
  });

  it("typing text in textarea updates its value", async () => {
    const user = userEvent.setup();

    render(<ChatInput />);

    const textarea = screen.getByPlaceholderText(
      "Type a message..."
    ) as HTMLTextAreaElement;

    await user.type(textarea, "Hello");

    expect(textarea.value).toBe("Hello");
  });

  it("pressing Enter calls sendMessage", async () => {
    const user = userEvent.setup();

    render(<ChatInput />);

    const textarea = screen.getByPlaceholderText("Type a message...");

    await user.type(textarea, "Hello");
    await user.keyboard("{Enter}");

    expect(mockSendMessage).toHaveBeenCalled();
  });

  it("pressing Shift+Enter does NOT call sendMessage", async () => {
    const user = userEvent.setup();

    render(<ChatInput />);

    const textarea = screen.getByPlaceholderText("Type a message...");

    await user.type(textarea, "Hello");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("send button is enabled after typing text", async () => {
    const user = userEvent.setup();

    render(<ChatInput />);

    const textarea = screen.getByPlaceholderText("Type a message...");

    await user.type(textarea, "Hello");

    const buttons = screen.getAllByRole("button");
    // At least one button should now be enabled
    const enabledButton = buttons.find(
      (btn) => !(btn as HTMLButtonElement).disabled
    );
    expect(enabledButton).toBeDefined();
  });

  it("send button becomes clickable after typing", async () => {
    const user = userEvent.setup();
    const { container } = render(<ChatInput />);

    const textarea = screen.getByPlaceholderText("Type a message...");

    // Before typing, all send-like buttons should be disabled
    await user.type(textarea, "Hi");

    // After typing, at least one button should be enabled
    const buttons = container.querySelectorAll("button:not([disabled])");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("textarea clears after sending a message", async () => {
    const user = userEvent.setup();

    render(<ChatInput />);

    const textarea = screen.getByPlaceholderText(
      "Type a message..."
    ) as HTMLTextAreaElement;

    await user.type(textarea, "Hello");
    await user.keyboard("{Enter}");

    expect(textarea.value).toBe("");
  });
});
