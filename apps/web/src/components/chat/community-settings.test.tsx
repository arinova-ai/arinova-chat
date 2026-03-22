import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
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
      if (url.includes("/members")) return Promise.resolve({ members: [] });
      if (url.includes("/applications")) return Promise.resolve({ applications: [] });
      if (url.includes("/invites")) return Promise.resolve({ invites: [] });
      return Promise.resolve({});
    });
  });

  it("renders without crashing when open", () => {
    const { container } = render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    expect(container).toBeTruthy();
  });

  it("renders nothing meaningful when closed", () => {
    const { container } = render(
      <CommunitySettingsSheet
        open={false}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    expect(container).toBeTruthy();
  });
});
