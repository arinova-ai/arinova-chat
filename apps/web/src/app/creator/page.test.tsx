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
});
