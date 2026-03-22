import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/creator",
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

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import CreatorPage from "./page";

describe("CreatorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: dashboard stats loads
    mockApi.mockImplementation((url: string) => {
      if (url.includes("/api/creator/dashboard")) {
        return Promise.resolve({
          totalRevenue: 500,
          totalDownloads: 100,
          totalUsers: 50,
          avgRating: 4.2,
          totalReviews: 10,
          creations: { stickerPacks: 3, agents: 2, themes: 1, communities: 0, spaces: 0 },
          recentEarnings: [],
        });
      }
      if (url.includes("/api/creator/sticker-packs")) return Promise.resolve([]);
      if (url.includes("/api/creator/agents")) return Promise.resolve([]);
      if (url.includes("/api/expert/my")) return Promise.resolve({ experts: [] });
      return Promise.resolve({});
    });
  });

  it("renders tab buttons", async () => {
    render(<CreatorPage />);
    // Tab keys from TAB_DEFS use i18n
    expect(await screen.findByText("creator.tab.stickers")).toBeInTheDocument();
    expect(screen.getByText("creator.tab.experts")).toBeInTheDocument();
    expect(screen.getByText("creator.tab.spaces")).toBeInTheDocument();
    expect(screen.getByText("creator.tab.community")).toBeInTheDocument();
    expect(screen.getByText("creator.tab.overview")).toBeInTheDocument();
  });

  it("renders overview stats on load", async () => {
    render(<CreatorPage />);
    // Revenue stat card
    expect(await screen.findByText("creator.totalRevenue")).toBeInTheDocument();
  });

  it("can switch to experts tab", async () => {
    render(<CreatorPage />);
    await screen.findByText("creator.tab.experts");
    fireEvent.click(screen.getByText("creator.tab.experts"));
    // After clicking experts tab, the experts section should render
    // The create expert button uses i18n key
    expect(await screen.findByText("creator.expert.create")).toBeInTheDocument();
  });

  it("can switch to stickers tab", async () => {
    render(<CreatorPage />);
    await screen.findByText("creator.tab.stickers");
    fireEvent.click(screen.getByText("creator.tab.stickers"));
    // Sticker tab should show create button
    expect(await screen.findByText("creator.sticker.create")).toBeInTheDocument();
  });
});
