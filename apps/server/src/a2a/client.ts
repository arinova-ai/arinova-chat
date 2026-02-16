import type { WSServerEvent } from "@arinova/shared/types";

interface A2AStreamOptions {
  endpoint: string;
  content: string;
  conversationId: string;
  messageId: string;
  onChunk: (chunk: string) => void;
  onComplete: (fullContent: string) => void;
  onError: (error: string) => void;
  signal?: AbortSignal;
}

/**
 * A2A Protocol client.
 * Sends a task to an A2A agent endpoint and streams the response via SSE.
 * Falls back to mock streaming if the agent is unreachable.
 */
export async function streamA2AResponse(options: A2AStreamOptions): Promise<void> {
  const { endpoint, content, conversationId, messageId, onChunk, onComplete, onError, signal } = options;

  try {
    // Resolve the agent card to find the task endpoint
    const agentCardUrl = endpoint;
    const taskUrl = agentCardUrl.replace("/.well-known/agent.json", "/tasks/send");

    const res = await fetch(taskUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: messageId,
        method: "tasks/sendSubscribe",
        params: {
          id: messageId,
          message: {
            role: "user",
            parts: [{ type: "text", text: content }],
          },
        },
      }),
      signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`A2A agent responded with ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);
            // Handle A2A SSE events
            if (event.result?.status?.state === "working") {
              const parts = event.result?.status?.message?.parts ?? [];
              for (const part of parts) {
                if (part.type === "text" && part.text) {
                  const newContent = part.text.slice(accumulated.length);
                  if (newContent) {
                    accumulated += newContent;
                    onChunk(newContent);
                  }
                }
              }
            } else if (event.result?.status?.state === "completed") {
              const parts = event.result?.status?.message?.parts ?? event.result?.artifacts?.[0]?.parts ?? [];
              for (const part of parts) {
                if (part.type === "text" && part.text) {
                  const newContent = part.text.slice(accumulated.length);
                  if (newContent) {
                    accumulated += newContent;
                    onChunk(newContent);
                  }
                }
              }
            }
          } catch {
            // Skip non-JSON lines
          }
        }
      }
    }

    onComplete(accumulated);
  } catch (err) {
    if (signal?.aborted) {
      onError("Stream cancelled");
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    console.error(`A2A agent unreachable (${endpoint}): ${message}`);
    onError(`Agent unreachable: ${message}`);
  }
}
