import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, ApiError } from "./api";

vi.mock("@/lib/config", () => ({
  BACKEND_URL: "http://test-backend:3501",
}));

function makeFetchResponse(
  body: unknown,
  status: number,
  ok: boolean
): Response {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("ApiError", () => {
  it("is an instance of Error with status and message", () => {
    const err = new ApiError(404, "Not Found");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(err.message).toBe("Not Found");
  });
});

describe("api()", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("parses a successful JSON response", async () => {
    const payload = { id: "1", name: "test" };
    global.fetch = vi.fn().mockResolvedValue(makeFetchResponse(payload, 200, true));

    const result = await api<typeof payload>("/api/agents");
    expect(result).toEqual(payload);
  });

  it("prepends BACKEND_URL to the path", async () => {
    global.fetch = vi.fn().mockResolvedValue(makeFetchResponse({}, 200, true));

    await api("/api/agents");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://test-backend:3501/api/agents",
      expect.any(Object)
    );
  });

  it("always includes credentials: include", async () => {
    global.fetch = vi.fn().mockResolvedValue(makeFetchResponse({}, 200, true));

    await api("/api/agents");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("returns undefined for a 204 No Content response", async () => {
    const response = {
      ok: true,
      status: 204,
      json: vi.fn(),
    } as unknown as Response;
    global.fetch = vi.fn().mockResolvedValue(response);

    const result = await api("/api/something");
    expect(result).toBeUndefined();
    expect(response.json).not.toHaveBeenCalled();
  });

  it("throws ApiError with status and body.error message on non-OK response", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        makeFetchResponse({ error: "Unauthorized" }, 401, false)
      );

    await expect(api("/api/protected")).rejects.toThrow(ApiError);
    await expect(api("/api/protected")).rejects.toMatchObject({
      status: 401,
      message: "Unauthorized",
    });
  });

  it("throws ApiError with fallback HTTP status message when body has no error field", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(makeFetchResponse({}, 500, false));

    await expect(api("/api/broken")).rejects.toMatchObject({
      status: 500,
      message: "HTTP 500",
    });
  });

  it("throws ApiError even when response body is not valid JSON", async () => {
    const response = {
      ok: false,
      status: 502,
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
    } as unknown as Response;
    global.fetch = vi.fn().mockResolvedValue(response);

    await expect(api("/api/gateway")).rejects.toMatchObject({
      status: 502,
      message: "HTTP 502",
    });
  });

  it("sets Content-Type: application/json for string (JSON) bodies", async () => {
    global.fetch = vi.fn().mockResolvedValue(makeFetchResponse({}, 200, true));

    await api("/api/agents", {
      method: "POST",
      body: JSON.stringify({ name: "bot" }),
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("does NOT set Content-Type for FormData bodies", async () => {
    global.fetch = vi.fn().mockResolvedValue(makeFetchResponse({}, 200, true));

    const formData = new FormData();
    formData.append("file", new Blob(["hello"]), "hello.txt");

    await api("/api/upload", { method: "POST", body: formData });

    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callArgs.headers?.["Content-Type"]).toBeUndefined();
  });

  it("does NOT set Content-Type when there is no body", async () => {
    global.fetch = vi.fn().mockResolvedValue(makeFetchResponse({}, 200, true));

    await api("/api/agents");

    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callArgs.headers?.["Content-Type"]).toBeUndefined();
  });
});
