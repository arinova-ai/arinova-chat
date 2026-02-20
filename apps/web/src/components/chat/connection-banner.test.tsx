import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

let statusCallback: ((status: string) => void) | null = null;

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

  it("shows 'Reconnecting...' when status is 'disconnected'", () => {
    (wsManager as { status: string }).status = "disconnected";
    render(<ConnectionBanner />);
    expect(screen.getByText("Reconnecting...")).toBeInTheDocument();
  });

  it("shows 'Syncing...' when status is 'syncing'", () => {
    (wsManager as { status: string }).status = "syncing";
    render(<ConnectionBanner />);
    expect(screen.getByText("Syncing...")).toBeInTheDocument();
  });

  it("updates to show 'Reconnecting...' when status changes via callback", () => {
    (wsManager as { status: string }).status = "connected";
    render(<ConnectionBanner />);

    act(() => {
      if (statusCallback) statusCallback("disconnected");
    });

    expect(screen.getByText("Reconnecting...")).toBeInTheDocument();
  });

  it("updates to show 'Syncing...' when status changes via callback", () => {
    (wsManager as { status: string }).status = "connected";
    render(<ConnectionBanner />);

    act(() => {
      if (statusCallback) statusCallback("syncing");
    });

    expect(screen.getByText("Syncing...")).toBeInTheDocument();
  });

  it("hides banner when status changes back to connected", () => {
    (wsManager as { status: string }).status = "disconnected";
    const { container } = render(<ConnectionBanner />);

    expect(screen.getByText("Reconnecting...")).toBeInTheDocument();

    act(() => {
      if (statusCallback) statusCallback("connected");
    });

    expect(container).toBeEmptyDOMElement();
  });
});
