import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
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
  AGENT_DEFAULT_AVATAR: "/default-avatar.png",
  assetUrl: (url: string | null) => url ?? "",
}));

// Mock chat-store
vi.mock("@/store/chat-store", () => ({
  useChatStore: (sel: Function) =>
    sel({
      activeConversationId: "conv-1",
      conversations: [],
      setActiveConversation: vi.fn(),
      jumpToMessage: vi.fn(),
      currentUserId: "user1",
    }),
}));

// Mock toast-store
vi.mock("@/store/toast-store", () => ({
  useToastStore: (sel: Function) =>
    sel({
      addToast: vi.fn(),
    }),
}));

// Mock default-avatar-picker
vi.mock("@/components/ui/default-avatar-picker", () => ({
  DefaultAvatarPicker: () => <div data-testid="avatar-picker" />,
}));

// Mock image-compress
vi.mock("@/lib/image-compress", () => ({
  compressImage: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import { CommunitySettingsSheet } from "./community-settings";

describe("CommunitySettingsSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.mockImplementation((url: string) => {
      if (url.includes("/settings")) {
        return Promise.resolve({
          id: "comm-1",
          creatorId: "user1",
          name: "Test Community",
          description: "A community",
          avatarUrl: null,
          requireApproval: false,
          approvalQuestions: null,
          isPrivate: false,
          invitePermission: "anyone",
          postPermission: "members",
          allowAgents: true,
          agentJoinPolicy: "open",
        });
      }
      if (url.includes("/members")) return Promise.resolve([]);
      if (url.includes("/applications")) return Promise.resolve([]);
      if (url.includes("/invites")) return Promise.resolve([]);
      return Promise.resolve({});
    });
  });

  it("renders tabs when open", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    // Tab names via i18n keys
    expect(await screen.findByText("community.settings.tab.info")).toBeInTheDocument();
    expect(screen.getByText("community.settings.tab.personal")).toBeInTheDocument();
    expect(screen.getByText("community.settings.tab.permissions")).toBeInTheDocument();
  });

  it("renders name form field", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    // After loading, name field should have community name
    expect(await screen.findByDisplayValue("Test Community")).toBeInTheDocument();
  });

  it("renders description form field", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    await screen.findByDisplayValue("Test Community");
    expect(screen.getByDisplayValue("A community")).toBeInTheDocument();
  });

  it("renders save button", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    await screen.findByDisplayValue("Test Community");
    expect(screen.getByText("community.settings.save")).toBeInTheDocument();
  });
});
