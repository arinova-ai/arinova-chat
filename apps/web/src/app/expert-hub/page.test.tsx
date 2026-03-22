import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/expert-hub",
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
  assetUrl: (url: string | null) => url ?? "",
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

vi.mock("@/components/ui/page-title", () => ({
  PageTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  AvatarImage: () => <img />,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/components/ui/arinova-spinner", () => ({
  ArinovaSpinner: () => <div data-testid="spinner" />,
}));

import ExpertHubPage from "./page";

describe("ExpertHubPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders expert cards when API returns data", async () => {
    mockApi.mockResolvedValue({
      experts: [
        {
          id: "e1",
          name: "Alice Expert",
          description: "An AI expert",
          avatarUrl: null,
          category: "tech",
          pricePerAsk: 10,
          totalAsks: 100,
          avgRating: 4.5,
          freeTrialCount: 3,
          ownerName: "Owner1",
          ownerImage: null,
          ownerUsername: "owner1",
        },
      ],
    });

    render(<ExpertHubPage />);
    vi.advanceTimersByTime(400);
    expect(await screen.findByText("Alice Expert")).toBeInTheDocument();
  });

  it("renders category filter buttons", async () => {
    mockApi.mockResolvedValue({ experts: [] });
    render(<ExpertHubPage />);
    vi.advanceTimersByTime(400);

    expect(await screen.findByText("expertHub.allCategories")).toBeInTheDocument();
    expect(screen.getByText("tech")).toBeInTheDocument();
    expect(screen.getByText("business")).toBeInTheDocument();
  });

  it("renders search input", async () => {
    mockApi.mockResolvedValue({ experts: [] });
    render(<ExpertHubPage />);
    vi.advanceTimersByTime(400);

    const searchInput = screen.getByPlaceholderText("expertHub.searchPlaceholder");
    expect(searchInput).toBeInTheDocument();
    fireEvent.change(searchInput, { target: { value: "test" } });
    expect(searchInput).toHaveValue("test");
  });

  it("shows empty state when no experts returned", async () => {
    mockApi.mockResolvedValue({ experts: [] });
    render(<ExpertHubPage />);
    vi.advanceTimersByTime(400);

    expect(await screen.findByText("expertHub.empty")).toBeInTheDocument();
  });
});
