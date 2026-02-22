import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, ApiError } from "./api";

// Mock config
vi.mock("./config", () => ({
  BACKEND_URL: "http://localhost:3501",
}));

// Mock toast store
vi.mock("@/store/toast-store", () => ({
  useToastStore: {
    getState: () => ({
      addToast: vi.fn(),
    }),
  },
}));

describe("api", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("makes GET request with credentials", async () => {
    const mockResponse = { data: "test" };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    const result = await api("/api/test");
    expect(result).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3501/api/test",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("sets Content-Type for JSON body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    await api("/api/test", {
      method: "POST",
      body: JSON.stringify({ name: "test" }),
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3501/api/test",
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
  });

  it("does not set Content-Type for FormData", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const formData = new FormData();
    await api("/api/upload", { method: "POST", body: formData });

    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callArgs.headers["Content-Type"]).toBeUndefined();
  });

  it("returns undefined for 204 status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 204 })
    );

    const result = await api("/api/delete");
    expect(result).toBeUndefined();
  });

  it("throws ApiError for non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
    );

    await expect(api("/api/missing")).rejects.toThrow(ApiError);
    await vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
    );
    try {
      await api("/api/missing");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(404);
      expect((e as ApiError).message).toBe("Not found");
    }
  });

  it("falls back to HTTP status when no error body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("not json", { status: 500 })
    );

    try {
      await api("/api/broken");
    } catch (e) {
      expect((e as ApiError).message).toBe("HTTP 500");
    }
  });
});
