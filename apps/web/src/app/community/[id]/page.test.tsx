import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next/navigation
const mockPush = vi.fn();
const mockBack = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: mockBack }),
  useParams: () => ({ id: "community-1" }),
  usePathname: () => "/community/community-1",
  useSearchParams: () => new URLSearchParams(),
}));

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

// Mock api
const mockApi = vi.fn();
vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

// Mock config
vi.mock("@/lib/config", () => ({
  BACKEND_URL: "http://localhost:3000",
  assetUrl: (url: string | null) => url ?? "",
}));

// Mock chat-store
const mockSetActiveConversation = vi.fn();
vi.mock("@/store/chat-store", () => ({
  useChatStore: (sel: Function) =>
    sel({
      activeConversationId: null,
      conversations: [],
      setActiveConversation: mockSetActiveConversation,
      jumpToMessage: vi.fn(),
      currentUserId: "user1",
    }),
}));

// Mock child components
vi.mock("@/components/auth-guard", () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/chat/icon-rail", () => ({
  IconRail: () => <div data-testid="icon-rail" />,
}));

vi.mock("@/components/chat/mobile-bottom-nav", () => ({
  MobileBottomNav: () => <div data-testid="mobile-bottom-nav" />,
}));

vi.mock("@/components/chat/community-settings", () => ({
  CommunitySettingsSheet: () => <div data-testid="community-settings" />,
}));

vi.mock("@/components/ui/default-avatar-picker", () => ({
  DefaultAvatarPicker: () => <div data-testid="avatar-picker" />,
}));

vi.mock("@/components/chat/wiki-panel", () => ({
  WikiPanel: () => <div data-testid="wiki-panel" />,
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import CommunityDetailPage from "./page";

describe("CommunityDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: community loads with data
    mockApi.mockImplementation((url: string) => {
      if (url.includes("/api/communities/community-1")) {
        return Promise.resolve({
          id: "community-1",
          creatorId: "other-user",
          name: "Test Community",
          description: "A test community",
          type: "community",
          joinFee: 0,
          monthlyFee: 0,
          agentCallFee: 0,
          status: "active",
          memberCount: 42,
          avatarUrl: null,
          coverImageUrl: "https://example.com/cover.jpg",
          category: "tech",
          verified: false,
          csMode: null,
          conversationId: "conv-1",
          createdAt: "2024-01-01",
        });
      }
      if (url.includes("/members")) {
        return Promise.resolve([]);
      }
      if (url.includes("/agents")) {
        return Promise.resolve([]);
      }
      return Promise.resolve({});
    });
  });

  it("renders the community name after loading", async () => {
    render(<CommunityDetailPage />);
    expect(await screen.findByText("Test Community")).toBeInTheDocument();
  });

  it("shows join button for non-members", async () => {
    render(<CommunityDetailPage />);
    // The join button uses i18n key
    expect(await screen.findByText("community.detail.join")).toBeInTheDocument();
  });

  it("displays cover image when present", async () => {
    render(<CommunityDetailPage />);
    await screen.findByText("Test Community");
    const coverImg = screen.getByAlt?.("Test Community") ?? screen.getByRole("img");
    expect(coverImg).toBeInTheDocument();
  });

  it("shows member count", async () => {
    render(<CommunityDetailPage />);
    expect(await screen.findByText(/42/)).toBeInTheDocument();
  });
});
