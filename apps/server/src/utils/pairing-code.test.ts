import { describe, it, expect } from "vitest";
import { generateSecretToken } from "./pairing-code";

describe("generateSecretToken", () => {
  it("starts with ari_ prefix", () => {
    const token = generateSecretToken();
    expect(token.startsWith("ari_")).toBe(true);
  });

  it("is 52 characters total (4 prefix + 48 hex)", () => {
    const token = generateSecretToken();
    expect(token).toHaveLength(52);
  });

  it("suffix is valid hex", () => {
    const token = generateSecretToken();
    const suffix = token.slice(4);
    expect(suffix).toMatch(/^[0-9a-f]{48}$/);
  });

  it("generates unique tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSecretToken()));
    expect(tokens.size).toBe(100);
  });
});
