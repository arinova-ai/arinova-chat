import { describe, it, expect } from "vitest";
import { assetUrl } from "./config";

// BACKEND_URL is derived from window.location / env at module load time.
// In the jsdom environment NEXT_PUBLIC_API_URL is not set, so BACKEND_URL
// resolves to `${window.location.protocol}//${window.location.hostname}:21001`
// which in jsdom defaults to "http://localhost:21001".
const EXPECTED_BACKEND = "http://localhost:21001";

describe("assetUrl()", () => {
  it("returns an absolute http:// URL unchanged", () => {
    const url = "http://cdn.example.com/uploads/image.png";
    expect(assetUrl(url)).toBe(url);
  });

  it("returns an absolute https:// URL unchanged", () => {
    const url = "https://cdn.example.com/uploads/image.png";
    expect(assetUrl(url)).toBe(url);
  });

  it("prepends BACKEND_URL to a relative path", () => {
    const path = "/uploads/img.png";
    expect(assetUrl(path)).toBe(`${EXPECTED_BACKEND}${path}`);
  });

  it("prepends BACKEND_URL to a relative path without leading slash", () => {
    const path = "uploads/avatar.jpg";
    expect(assetUrl(path)).toBe(`${EXPECTED_BACKEND}${path}`);
  });

  it("handles an empty string by returning BACKEND_URL alone", () => {
    expect(assetUrl("")).toBe(EXPECTED_BACKEND);
  });
});
