import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render } from "@testing-library/react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock chat-store
vi.mock("@/store/chat-store", () => ({
  useChatStore: Object.assign(
    (sel: Function) =>
      sel({
        activeConversationId: null,
        conversations: [],
        setActiveConversation: vi.fn(),
        jumpToMessage: vi.fn(),
        currentUserId: "user1",
      }),
    {
      getState: () => ({
        activeConversationId: null,
        setActiveConversation: vi.fn(),
        jumpToMessage: vi.fn(),
      }),
    }
  ),
}));

// Mock push lib
const mockRefreshPush = vi.fn();
const mockSetupClickHandler = vi.fn().mockReturnValue(vi.fn());
vi.mock("@/lib/push", () => ({
  refreshPushSubscription: () => mockRefreshPush(),
  setupNotificationClickHandler: (cb: Function) => mockSetupClickHandler(cb),
}));

// Note: PushNotificationHandler is at components/push-notification-handler.tsx
// but the test spec says components/chat/push-notification-handler.test.tsx
// Import from the actual location
import { PushNotificationHandler } from "../push-notification-handler";

describe("PushNotificationHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without errors (returns null)", () => {
    const { container } = render(<PushNotificationHandler />);
    expect(container.innerHTML).toBe("");
  });

  it("calls refreshPushSubscription on mount", () => {
    render(<PushNotificationHandler />);
    expect(mockRefreshPush).toHaveBeenCalledTimes(1);
  });

  it("sets up notification click handler on mount", () => {
    render(<PushNotificationHandler />);
    expect(mockSetupClickHandler).toHaveBeenCalledTimes(1);
    expect(typeof mockSetupClickHandler.mock.calls[0][0]).toBe("function");
  });
});
