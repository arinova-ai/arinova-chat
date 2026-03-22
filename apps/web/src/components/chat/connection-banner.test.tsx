import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";

let statusCallback: ((status: string) => void) | null = null;

// Mock i18n
vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@/lib/ws", () => ({
  wsManager: {
    status: "connected",
    onStatusChange: vi.fn((cb: (status: string) => void) => {
      statusCallback = cb;
      return vi.fn();
    }),
  },
}));

// Import after mock setup
import { ConnectionBanner } from "./connection-banner";
import { wsManager } from "@/lib/ws";

describe("ConnectionBanner", () => {
  beforeEach(() => {
    statusCallback = null;
    // Reset the mock status to connected before each test
    (wsManager as { status: string }).status = "connected";
    vi.clearAllMocks();
  });

  it("renders nothing when status is 'connected'", () => {
    (wsManager as { status: string }).status = "connected";
    const { container } = render(<ConnectionBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows 'connection.reconnecting' when status is 'disconnected'", () => {
    (wsManager as { status: string }).status = "disconnected";
    render(<ConnectionBanner />);
    expect(screen.getByText("connection.reconnecting")).toBeInTheDocument();
  });

  it("shows 'connection.syncing' when status is 'syncing'", () => {
    (wsManager as { status: string }).status = "syncing";
    render(<ConnectionBanner />);
    expect(screen.getByText("connection.syncing")).toBeInTheDocument();
  });

  it("updates to show 'connection.reconnecting' when status changes via callback", () => {
    (wsManager as { status: string }).status = "connected";
    render(<ConnectionBanner />);

    act(() => {
      if (statusCallback) statusCallback("disconnected");
    });

    expect(screen.getByText("connection.reconnecting")).toBeInTheDocument();
  });

  it("updates to show 'connection.syncing' when status changes via callback", () => {
    (wsManager as { status: string }).status = "connected";
    render(<ConnectionBanner />);

    act(() => {
      if (statusCallback) statusCallback("syncing");
    });

    expect(screen.getByText("connection.syncing")).toBeInTheDocument();
  });

  it("hides banner when status changes back to connected", () => {
    (wsManager as { status: string }).status = "disconnected";
    const { container } = render(<ConnectionBanner />);

    expect(screen.getByText("connection.reconnecting")).toBeInTheDocument();

    act(() => {
      if (statusCallback) statusCallback("connected");
    });

    expect(container).toBeEmptyDOMElement();
  });
});
