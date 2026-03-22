import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock i18n
vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Mock api
vi.mock("@/lib/api", () => ({
  api: vi.fn().mockResolvedValue({ incoming: [] }),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

// Mock shortcut-store
vi.mock("@/store/shortcut-store", () => ({
  useShortcutStore: (sel: Function) =>
    sel({
      shortcuts: [],
      editing: false,
      loaded: true,
      removeShortcut: vi.fn(),
      setEditing: vi.fn(),
      fetchShortcuts: vi.fn(),
    }),
}));

// Mock account-store
vi.mock("@/store/account-store", () => ({
  useAccountStore: (sel: Function) =>
    sel({
      accounts: [],
      activeAccountId: null,
    }),
}));

// Mock child components
vi.mock("./add-shortcut-sheet", () => ({
  AddShortcutSheet: () => <div data-testid="add-shortcut-sheet" />,
}));

import { MobileBottomNav } from "./mobile-bottom-nav";

describe("MobileBottomNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nav buttons", () => {
    render(<MobileBottomNav />);
    expect(screen.getByText("nav.chat")).toBeInTheDocument();
    expect(screen.getByText("nav.office")).toBeInTheDocument();
    expect(screen.getByText("nav.friends")).toBeInTheDocument();
    expect(screen.getByText("nav.settings")).toBeInTheDocument();
  });

  it("shows active state for current route (chat)", () => {
    render(<MobileBottomNav />);
    // The chat button should have brand-text class since pathname is "/"
    const chatButton = screen.getByText("nav.chat").closest("button");
    expect(chatButton).toBeInTheDocument();
    expect(chatButton?.className).toContain("text-brand-text");
  });

  it("renders personal items in menu when opened", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(<MobileBottomNav />);
    // Click the center Arinova button to open menu
    const arinovaBtn = screen.getByLabelText("common.openMenu");
    fireEvent.click(arinovaBtn);
    // Personal items should be visible
    expect(screen.getByText("nav.spaces")).toBeInTheDocument();
    expect(screen.getByText("nav.stickers")).toBeInTheDocument();
    expect(screen.getByText("nav.creator")).toBeInTheDocument();
    expect(screen.getByText("nav.wallet")).toBeInTheDocument();
  });

  it("renders the Arinova center button", () => {
    render(<MobileBottomNav />);
    expect(screen.getByLabelText("common.openMenu")).toBeInTheDocument();
  });
});
