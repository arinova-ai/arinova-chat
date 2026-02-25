import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAutoScroll } from "./use-auto-scroll";

describe("useAutoScroll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an object with ref, showScrollButton, and scrollToBottom", () => {
    const { result } = renderHook(() => useAutoScroll([0]));
    expect(result.current).toBeDefined();
    expect(result.current).toHaveProperty("ref");
    expect(result.current).toHaveProperty("showScrollButton");
    expect(result.current).toHaveProperty("scrollToBottom");
  });

  it("ref starts as null", () => {
    const { result } = renderHook(() => useAutoScroll([0]));
    expect(result.current.ref.current).toBeNull();
  });

  it("scrolls to bottom on dependency change when near bottom", () => {
    const mockElement = {
      scrollTop: 0,
      scrollHeight: 500,
      clientHeight: 400,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    const { result, rerender } = renderHook(
      ({ deps }) => useAutoScroll(deps),
      { initialProps: { deps: [0] } }
    );

    // Attach mock element to ref
    Object.defineProperty(result.current.ref, "current", {
      value: mockElement,
      writable: true,
    });

    // Rerender with new deps to trigger auto-scroll effect
    rerender({ deps: [1] });

    // Since userScrolledUp is false (default), it should scroll
    expect(mockElement.scrollTop).toBe(500);
  });

  it("does not scroll when ref.current is null", () => {
    const { result, rerender } = renderHook(
      ({ deps }) => useAutoScroll(deps),
      { initialProps: { deps: [0] } }
    );

    // ref is null, should not throw
    expect(result.current.ref.current).toBeNull();
    rerender({ deps: [1] });
    // If it doesn't throw, the guard works
  });

  it("preserves the same ref across rerenders", () => {
    const { result, rerender } = renderHook(
      ({ deps }) => useAutoScroll(deps),
      { initialProps: { deps: [0] } }
    );

    const firstRef = result.current.ref;
    rerender({ deps: [1] });
    expect(result.current.ref).toBe(firstRef);
  });
});
