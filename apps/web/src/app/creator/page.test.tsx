import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
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

vi.mock("@/components/ui/button", () => ({
  Button: (props: any) => <button {...props} />,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: (props: any) => <input type="checkbox" {...props} />,
}));

vi.mock("@/components/ui/page-title", () => ({
  PageTitle: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("@/components/ui/arinova-spinner", () => ({
  ArinovaSpinner: () => <div data-testid="spinner" />,
}));

vi.mock("@/lib/config", () => ({
  assetUrl: (url: string | null) => url ?? "",
  BACKEND_URL: "http://localhost:21001",
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
      if (url.includes("/api/creator/stickers")) return Promise.resolve({ packs: [] });
      if (url.includes("/api/creator/agents")) return Promise.resolve({ agents: [] });
      if (url.includes("/api/expert/my")) return Promise.resolve({ experts: [] });
      return Promise.resolve({});
    });
  });

  it("renders tab buttons", async () => {
    render(<CreatorPage />);
    // Tab keys from TAB_DEFS use i18n - some may appear multiple times (tab + stats)
    expect(await screen.findByText("creator.tab.stickers")).toBeInTheDocument();
    expect(screen.getByText("creator.tab.experts")).toBeInTheDocument();
    expect(screen.getAllByText("creator.tab.spaces").length).toBeGreaterThan(0);
    expect(screen.getAllByText("creator.tab.community").length).toBeGreaterThan(0);
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
    // Just verify the tab switch doesn't crash
    expect(screen.getByText("creator.tab.experts")).toBeInTheDocument();
  });

  it("can switch to stickers tab", async () => {
    render(<CreatorPage />);
    await screen.findByText("creator.tab.stickers");
    fireEvent.click(screen.getByText("creator.tab.stickers"));
    // Sticker tab should render
    expect(screen.getByText("creator.tab.stickers")).toBeInTheDocument();
  });

  it("renders stickers tab content with pack list", async () => {
    mockApi.mockImplementation((url: string) => {
      if (url.includes("/api/creator/dashboard")) {
        return Promise.resolve({
          totalRevenue: 0, totalDownloads: 0, totalUsers: 0, avgRating: 0, totalReviews: 0,
          creations: { stickerPacks: 1, agents: 0, themes: 0, communities: 0, spaces: 0 },
          recentEarnings: [],
        });
      }
      if (url.includes("/api/creator/stickers")) {
        return Promise.resolve({
          packs: [{ id: "p1", name: "Fun Pack", downloads: 50, price: 10, status: "active", stickerCount: 8 }],
        });
      }
      if (url.includes("/api/creator/agents") || url.includes("/api/wallet") || url.includes("/api/expert")) return Promise.resolve({ listings: [], balance: 0, experts: [] });
      return Promise.resolve({});
    });
    render(<CreatorPage />);
    await screen.findByText("creator.tab.stickers");
    fireEvent.click(screen.getByText("creator.tab.stickers"));
    expect(await screen.findByText("Fun Pack")).toBeInTheDocument();
  });

  it("renders spaces tab with create button", async () => {
    mockApi.mockImplementation((url: string) => {
      if (url.includes("/api/creator/dashboard")) {
        return Promise.resolve({
          totalRevenue: 0, totalDownloads: 0, totalUsers: 0, avgRating: 0, totalReviews: 0,
          creations: { stickerPacks: 0, agents: 0, themes: 0, communities: 0, spaces: 0 },
          recentEarnings: [],
        });
      }
      if (url.includes("/api/creator/spaces")) return Promise.resolve({ spaces: [] });
      if (url.includes("/api/creator/agents") || url.includes("/api/wallet") || url.includes("/api/expert")) return Promise.resolve({ listings: [], balance: 0, experts: [] });
      return Promise.resolve({});
    });
    render(<CreatorPage />);
    await screen.findByText("creator.tab.stickers");
    const spacesButtons = screen.getAllByText("creator.tab.spaces");
    fireEvent.click(spacesButtons[0]);
    expect(await screen.findByText("creator.createApp")).toBeInTheDocument();
  });

  it("renders community tab with create buttons", async () => {
    mockApi.mockImplementation((url: string) => {
      if (url.includes("/api/creator/dashboard")) {
        return Promise.resolve({
          totalRevenue: 0, totalDownloads: 0, totalUsers: 0, avgRating: 0, totalReviews: 0,
          creations: { stickerPacks: 0, agents: 0, themes: 0, communities: 0, spaces: 0 },
          recentEarnings: [],
        });
      }
      if (url.includes("/api/creator/community")) return Promise.resolve({ communities: [] });
      if (url.includes("/api/creator/agents") || url.includes("/api/wallet") || url.includes("/api/expert")) return Promise.resolve({ listings: [], balance: 0, experts: [] });
      return Promise.resolve({});
    });
    render(<CreatorPage />);
    await screen.findByText("creator.tab.stickers");
    const communityButtons = screen.getAllByText("creator.tab.community");
    fireEvent.click(communityButtons[0]);
    expect(await screen.findByText("creator.createCommunity")).toBeInTheDocument();
    expect(screen.getByText("creator.createLounge")).toBeInTheDocument();
  });

  it("renders experts tab with create button", async () => {
    mockApi.mockImplementation((url: string) => {
      if (url.includes("/api/creator/dashboard")) {
        return Promise.resolve({
          totalRevenue: 0, totalDownloads: 0, totalUsers: 0, avgRating: 0, totalReviews: 0,
          creations: { stickerPacks: 0, agents: 0, themes: 0, communities: 0, spaces: 0 },
          recentEarnings: [],
        });
      }
      if (url.includes("/api/expert-hub")) return Promise.resolve({ experts: [] });
      if (url.includes("/api/creator/agents") || url.includes("/api/wallet")) return Promise.resolve({ listings: [], balance: 0 });
      return Promise.resolve({});
    });
    render(<CreatorPage />);
    await screen.findByText("creator.tab.experts");
    fireEvent.click(screen.getByText("creator.tab.experts"));
    expect(await screen.findByText("expertHub.creator.create")).toBeInTheDocument();
  });

  it("renders overview creation counts", async () => {
    mockApi.mockImplementation((url: string) => {
      if (url.includes("/api/creator/dashboard")) {
        return Promise.resolve({
          totalRevenue: 500, totalDownloads: 100, totalUsers: 50, avgRating: 4.2, totalReviews: 10,
          creations: { stickerPacks: 3, agents: 2, themes: 1, communities: 4, spaces: 5 },
          recentEarnings: [],
        });
      }
      if (url.includes("/api/creator/agents") || url.includes("/api/wallet") || url.includes("/api/expert")) return Promise.resolve({ listings: [], balance: 0, experts: [] });
      return Promise.resolve({});
    });
    render(<CreatorPage />);
    expect(await screen.findByText("creator.yourCreations")).toBeInTheDocument();
    // Check creation counts are displayed
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders overview download stats", async () => {
    render(<CreatorPage />);
    expect(await screen.findByText("creator.totalDownloads")).toBeInTheDocument();
    expect(screen.getByText("creator.totalUsers")).toBeInTheDocument();
    expect(screen.getByText("creator.avgRating")).toBeInTheDocument();
  });

  it("renders recent activity section with no activity message", async () => {
    render(<CreatorPage />);
    expect(await screen.findByText("creator.recentActivity")).toBeInTheDocument();
    expect(screen.getByText("creator.noActivity")).toBeInTheDocument();
  });

  it("renders recent activity with earnings", async () => {
    mockApi.mockImplementation((url: string) => {
      if (url.includes("/api/creator/dashboard")) {
        return Promise.resolve({
          totalRevenue: 500, totalDownloads: 100, totalUsers: 50, avgRating: 4.2, totalReviews: 10,
          creations: { stickerPacks: 0, agents: 0, themes: 0, communities: 0, spaces: 0 },
          recentEarnings: [
            { id: "e1", amount: 25, description: "Sticker sale", source: "stickers", createdAt: "2025-01-01" },
          ],
        });
      }
      if (url.includes("/api/creator/agents") || url.includes("/api/wallet") || url.includes("/api/expert")) return Promise.resolve({ listings: [], balance: 0, experts: [] });
      return Promise.resolve({});
    });
    render(<CreatorPage />);
    expect(await screen.findByText("Sticker sale")).toBeInTheDocument();
    expect(screen.getByText("+25")).toBeInTheDocument();
  });

  it("renders themes tab", async () => {
    mockApi.mockImplementation((url: string) => {
      if (url.includes("/api/creator/dashboard")) {
        return Promise.resolve({
          totalRevenue: 0, totalDownloads: 0, totalUsers: 0, avgRating: 0, totalReviews: 0,
          creations: { stickerPacks: 0, agents: 0, themes: 0, communities: 0, spaces: 0 },
          recentEarnings: [],
        });
      }
      if (url.includes("/api/creator/themes")) return Promise.resolve({ themes: [] });
      if (url.includes("/api/creator/agents") || url.includes("/api/wallet") || url.includes("/api/expert")) return Promise.resolve({ listings: [], balance: 0, experts: [] });
      return Promise.resolve({});
    });
    render(<CreatorPage />);
    await screen.findByText("creator.tab.stickers");
    // The themes tab text may appear in both overview and tab bar
    const themesButtons = screen.getAllByText("creator.tab.themes");
    fireEvent.click(themesButtons[0]);
    expect(await screen.findByText("creator.newTheme")).toBeInTheDocument();
  });
});
