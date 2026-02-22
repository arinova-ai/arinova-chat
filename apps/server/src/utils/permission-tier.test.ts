import { describe, it, expect } from "vitest";
import { classifyPermissionTier, requiresManualReview } from "./permission-tier";

describe("classifyPermissionTier", () => {
  it("returns tier 0 for empty permissions", () => {
    expect(classifyPermissionTier([])).toBe(0);
  });

  it("returns tier 0 for unknown permissions", () => {
    expect(classifyPermissionTier(["unknown"])).toBe(0);
  });

  it("returns tier 1 for storage permission", () => {
    expect(classifyPermissionTier(["storage"])).toBe(1);
  });

  it("returns tier 1 for audio permission", () => {
    expect(classifyPermissionTier(["audio"])).toBe(1);
  });

  it("returns tier 2 for network permission", () => {
    expect(classifyPermissionTier(["network"])).toBe(2);
  });

  it("returns highest tier when mixed (storage + network → tier 2)", () => {
    expect(classifyPermissionTier(["storage", "network"])).toBe(2);
  });

  it("returns tier 1 for storage + audio", () => {
    expect(classifyPermissionTier(["storage", "audio"])).toBe(1);
  });
});

describe("requiresManualReview", () => {
  it("returns false for tier 0", () => {
    expect(requiresManualReview(0)).toBe(false);
  });

  it("returns false for tier 1", () => {
    expect(requiresManualReview(1)).toBe(false);
  });

  it("returns true for tier 2", () => {
    expect(requiresManualReview(2)).toBe(true);
  });
});
