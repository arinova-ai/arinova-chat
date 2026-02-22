import { describe, it, expect } from "vitest";
import { classifyPermissionTier, requiresManualReview } from "./permission-tier.js";

describe("classifyPermissionTier", () => {
  it("returns tier 0 for an empty permissions array", () => {
    expect(classifyPermissionTier([])).toBe(0);
  });

  it("returns tier 0 for permissions that are all innocuous / unknown", () => {
    // Permissions that don't fall into tier 1 or 2 should still give tier 0
    expect(classifyPermissionTier(["theme", "locale"])).toBe(0);
  });

  it("returns tier 1 for storage permission", () => {
    expect(classifyPermissionTier(["storage"])).toBe(1);
  });

  it("returns tier 1 for audio permission", () => {
    expect(classifyPermissionTier(["audio"])).toBe(1);
  });

  it("returns tier 1 for a combination of tier-1 permissions", () => {
    expect(classifyPermissionTier(["storage", "audio"])).toBe(1);
  });

  it("returns tier 2 for network permission", () => {
    expect(classifyPermissionTier(["network"])).toBe(2);
  });

  it("returns tier 2 when network is combined with tier-1 permissions", () => {
    expect(classifyPermissionTier(["storage", "audio", "network"])).toBe(2);
  });

  it("returns the highest applicable tier when multiple tiers are present", () => {
    // network alone should already push to tier 2
    expect(classifyPermissionTier(["network", "storage"])).toBe(2);
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
