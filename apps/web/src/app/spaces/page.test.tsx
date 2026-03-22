import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/spaces",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
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

// Mock spaces-store
const mockFetchSpaces = vi.fn();
vi.mock("@/store/spaces-store", () => ({
  useSpacesStore: (sel: Function) =>
    sel({
      spaces: [
        {
          id: "space-1",
          name: "Chess Arena",
          description: "Play chess online",
          category: "board_game",
          coverImageUrl: "https://example.com/chess.jpg",
          creatorId: "user1",
          status: "published",
        },
        {
          id: "space-2",
          name: "Trivia Night",
          description: "Test your knowledge",
          category: "trivia",
          coverImageUrl: null,
          creatorId: "user2",
          status: "published",
        },
      ],
      loading: false,
      error: null,
      fetchSpaces: mockFetchSpaces,
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

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import SpacesPage from "./page";

describe("SpacesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders space cards", () => {
    render(<SpacesPage />);
    expect(screen.getByText("Chess Arena")).toBeInTheDocument();
    expect(screen.getByText("Trivia Night")).toBeInTheDocument();
  });

  it("displays cover image when present", () => {
    render(<SpacesPage />);
    const coverImg = screen.getByAltText("Chess Arena");
    expect(coverImg).toBeInTheDocument();
    expect(coverImg).toHaveAttribute("src", "https://example.com/chess.jpg");
  });

  it("shows category badges", () => {
    render(<SpacesPage />);
    expect(screen.getAllByText("spaces.cat.board_game").length).toBeGreaterThan(0);
    expect(screen.getAllByText("spaces.cat.trivia").length).toBeGreaterThan(0);
  });

  it("shows play button", () => {
    render(<SpacesPage />);
    const playButtons = screen.getAllByText("spaces.play");
    expect(playButtons.length).toBeGreaterThanOrEqual(2);
  });
});
