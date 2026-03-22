import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

// Mock next/navigation
const mockReplace = vi.fn();
vi.mock("next/navigation", () => {
  let params = new URLSearchParams();
  return {
    useRouter: () => ({ push: vi.fn(), replace: mockReplace, back: vi.fn() }),
    usePathname: () => "/",
    useSearchParams: () => params,
    __setSearchParams: (p: URLSearchParams) => {
      params = p;
    },
  };
});

// Mock i18n
vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Mock auth-client
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "user1", name: "Test" } },
      isPending: false,
    }),
  },
}));

// Mock chat-store
const mockSetActiveConversation = vi.fn();
const mockJumpToMessage = vi.fn();
const mockLoadConversations = vi.fn();
const mockLoadAgents = vi.fn();
const mockLoadAgentHealth = vi.fn();
const mockInitWS = vi.fn().mockReturnValue(vi.fn());
vi.mock("@/store/chat-store", () => ({
  useChatStore: Object.assign(
    (sel: Function) =>
      sel({
        activeConversationId: null,
        searchActive: false,
        setActiveConversation: mockSetActiveConversation,
        jumpToMessage: mockJumpToMessage,
        setCurrentUserId: vi.fn(),
      }),
    {
      getState: () => ({
        loadConversations: mockLoadConversations,
        loadAgents: mockLoadAgents,
        loadAgentHealth: mockLoadAgentHealth,
        initWS: mockInitWS,
        activeConversationId: null,
        searchActive: false,
        clearSearch: vi.fn(),
      }),
    }
  ),
}));

// Mock voice-tts integration
vi.mock("@/lib/voice-tts-integration", () => ({
  initVoiceTTSIntegration: vi.fn().mockReturnValue(vi.fn()),
}));

// Mock chat-diagnostics
vi.mock("@/lib/chat-diagnostics", () => ({
  initChatDiagnostics: vi.fn(),
  useRenderDiag: vi.fn(),
}));

// Mock child components
vi.mock("./icon-rail", () => ({
  IconRail: () => <div data-testid="icon-rail" />,
}));

vi.mock("./mobile-bottom-nav", () => ({
  MobileBottomNav: () => <div data-testid="mobile-bottom-nav" />,
}));

vi.mock("./sidebar", () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));

vi.mock("./chat-area", () => ({
  ChatArea: () => <div data-testid="chat-area" />,
}));

vi.mock("./new-chat-dialog", () => ({
  NewChatDialog: () => <div data-testid="new-chat-dialog" />,
}));

vi.mock("@/components/voice/call-indicator", () => ({
  CallIndicator: () => <div data-testid="call-indicator" />,
}));

vi.mock("@/components/notification-banner", () => ({
  NotificationBanner: () => <div data-testid="notification-banner" />,
}));

vi.mock("./error-boundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("./right-panel", () => ({
  RightPanel: () => <div data-testid="right-panel" />,
}));

import { ChatLayout } from "./chat-layout";

describe("ChatLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.matchMedia
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    // Mock localStorage
    Object.defineProperty(window, "localStorage", {
      writable: true,
      value: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
      },
    });
  });

  it("renders children components", () => {
    render(<ChatLayout />);
    expect(screen.getAllByTestId("sidebar").length).toBeGreaterThan(0);
    expect(screen.getByTestId("chat-area")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel")).toBeInTheDocument();
  });

  it("initializes WS and loads data on mount", () => {
    render(<ChatLayout />);
    expect(mockLoadConversations).toHaveBeenCalled();
    expect(mockLoadAgents).toHaveBeenCalled();
    expect(mockInitWS).toHaveBeenCalled();
  });

  it("processes ?c= query param to set active conversation", async () => {
    // Set search params with c= before rendering
    const nav = await import("next/navigation");
    (nav as unknown as { __setSearchParams: (p: URLSearchParams) => void }).__setSearchParams(
      new URLSearchParams("c=conv-123")
    );

    render(<ChatLayout />);
    expect(mockSetActiveConversation).toHaveBeenCalledWith("conv-123");
  });

  it("processes ?c= and ?m= together to jump to message", async () => {
    const nav = await import("next/navigation");
    (nav as unknown as { __setSearchParams: (p: URLSearchParams) => void }).__setSearchParams(
      new URLSearchParams("c=conv-123&m=msg-456")
    );

    render(<ChatLayout />);
    expect(mockJumpToMessage).toHaveBeenCalledWith("conv-123", "msg-456");
  });
});
