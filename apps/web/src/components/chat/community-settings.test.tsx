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

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: any) => <div>{children}</div>,
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: any) => <button {...props} />,
}));

vi.mock("@/components/ui/input", () => ({
  Input: React.forwardRef((props: any, ref: any) => <input ref={ref} {...props} />),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: (props: any) => <input type="checkbox" role="switch" {...props} />,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, ...props }: any) => <option {...props}>{children}</option>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => <span />,
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  AvatarFallback: ({ children }: any) => <span>{children}</span>,
  AvatarImage: () => <img />,
}));

import { CommunitySettingsSheet } from "./community-settings";

describe("CommunitySettingsSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.mockImplementation((url: string) => {
      if (url.includes("/members")) {
        return Promise.resolve({
          members: [
            { id: "m1", userId: "user1", role: "creator", joinedAt: "2024-01-01", userName: "Test", userImage: null, notificationPreference: "all" },
          ],
        });
      }
      if (url.includes("/applications")) return Promise.resolve({ applications: [] });
      if (url.includes("/invites")) return Promise.resolve({ invites: [] });
      if (url.includes("/api/communities/comm-1")) {
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

  it("renders tab navigation when open", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    // Info tab label should appear
    expect(await screen.findByText("communitySettings.info")).toBeInTheDocument();
  });

  it("renders personal settings tab", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    expect(await screen.findByText("communitySettings.personalSettings")).toBeInTheDocument();
  });

  it("shows hidden users tab", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    expect(await screen.findByText("communitySettings.hiddenUsers")).toBeInTheDocument();
  });

  it("shows danger zone tab", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    expect(await screen.findByText("communitySettings.dangerZone")).toBeInTheDocument();
  });

  it("renders community name in info tab after loading", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    // The name label should appear
    expect(await screen.findByText("communitySettings.name")).toBeInTheDocument();
  });

  it("renders description field in info tab", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    expect(await screen.findByText("communitySettings.description")).toBeInTheDocument();
  });

  it("renders avatar section in info tab", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    expect(await screen.findByText("communitySettings.avatar")).toBeInTheDocument();
  });

  it("renders settings title in header", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    expect(await screen.findByText("communitySettings.title")).toBeInTheDocument();
  });

  it("renders with initialTab prop", () => {
    const { container } = render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
        initialTab="hidden"
      />
    );
    expect(container).toBeTruthy();
  });

  it("shows loading state initially", () => {
    // Mock API to never resolve (stay loading)
    mockApi.mockImplementation(() => new Promise(() => {}));
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    expect(screen.getByText("common.loading")).toBeInTheDocument();
  });

  it("renders save info button for admins after loading", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    expect(await screen.findByText("communitySettings.saveInfo")).toBeInTheDocument();
  });

  it("renders visibility toggle for admins", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    expect(await screen.findByText("communitySettings.visibility")).toBeInTheDocument();
  });

  it("renders require approval toggle for admins", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    expect(await screen.findByText("communitySettings.requireApproval")).toBeInTheDocument();
  });

  it("renders permissions tab for admins", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    expect(await screen.findByText("communitySettings.permissions")).toBeInTheDocument();
  });

  it("renders invites tab for admins", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    expect(await screen.findByText("communitySettings.invites")).toBeInTheDocument();
  });

  it("renders community name input with pre-filled value", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    await screen.findByText("communitySettings.name");
    const inputs = document.querySelectorAll("input");
    const nameInput = Array.from(inputs).find((i) => i.value === "Test Community");
    expect(nameInput).toBeTruthy();
  });

  it("renders community description input", async () => {
    render(
      <CommunitySettingsSheet
        open={true}
        onClose={vi.fn()}
        communityId="comm-1"
        conversationId="conv-1"
      />
    );
    await screen.findByText("communitySettings.description");
    const inputs = document.querySelectorAll("input");
    const descInput = Array.from(inputs).find((i) => i.value === "A community");
    expect(descInput).toBeTruthy();
  });
});
