import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { streamA2AResponse } from "./client.js";

// Helper: build a ReadableStream that emits SSE lines
function createSSEStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + "\n"));
      }
      controller.close();
    },
  });
}

// A2A SSE payloads matching the actual protocol
const workingLine = `data: ${JSON.stringify({
  result: {
    status: {
      state: "working",
      message: { parts: [{ type: "text", text: "Hello" }] },
    },
  },
})}`;

const completedLine = `data: ${JSON.stringify({
  result: {
    status: {
      state: "completed",
      message: { parts: [{ type: "text", text: "Hello world" }] },
    },
  },
})}`;

function makeOptions(overrides: Record<string, unknown> = {}) {
  return {
    endpoint: "https://agent.example.com/.well-known/agent.json",
    content: "hello",
    conversationId: "conv-1",
    messageId: "msg-1",
    onChunk: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

describe("streamA2AResponse", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("derives the task URL by replacing /.well-known/agent.json with /tasks/send", async () => {
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockResolvedValueOnce(
      new Response(createSSEStream([workingLine, completedLine]), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    await streamA2AResponse(makeOptions());

    expect(mockedFetch).toHaveBeenCalledWith(
      "https://agent.example.com/tasks/send",
      expect.anything()
    );
  });

  it("POSTs with a JSON-RPC body and SSE Accept header", async () => {
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockResolvedValueOnce(
      new Response(createSSEStream([workingLine, completedLine]), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    await streamA2AResponse(makeOptions());

    const [, init] = mockedFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");

    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get("Accept")).toBe("text/event-stream");

    const body = JSON.parse(init.body as string);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.method).toBe("tasks/sendSubscribe");
  });

  it("calls onChunk for working state and onComplete when stream finishes", async () => {
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockResolvedValueOnce(
      new Response(
        createSSEStream(["", workingLine, "", completedLine, ""]),
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const onChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    await streamA2AResponse(
      makeOptions({ onChunk, onComplete, onError })
    );

    expect(onChunk).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("calls onError with 'Agent unreachable' when fetch returns non-OK", async () => {
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockResolvedValueOnce(
      new Response(null, { status: 500, statusText: "Internal Server Error" })
    );

    const onError = vi.fn();

    await streamA2AResponse(makeOptions({ onError }));

    expect(onError).toHaveBeenCalledWith(
      expect.stringMatching(/Agent unreachable/i)
    );
  });

  it("calls onError with 'Agent unreachable' when fetch rejects", async () => {
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockRejectedValueOnce(new Error("Network failure"));

    const onError = vi.fn();

    await streamA2AResponse(makeOptions({ onError }));

    expect(onError).toHaveBeenCalledWith(
      expect.stringMatching(/Agent unreachable/i)
    );
  });

  it("calls onError with 'Stream cancelled' when abort signal fires", async () => {
    const mockedFetch = vi.mocked(fetch);

    // Pre-abort the signal so the read() rejects immediately
    const abortController = new AbortController();
    abortController.abort();

    mockedFetch.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

    const onError = vi.fn();

    await streamA2AResponse(
      makeOptions({ onError, signal: abortController.signal })
    );

    expect(onError).toHaveBeenCalledWith("Stream cancelled");
  });
});
