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

    // Fallback to mock streaming
    console.log(`A2A agent unreachable (${endpoint}), falling back to mock response`);
    await mockStream(options);
  }
}

async function mockStream(options: A2AStreamOptions): Promise<void> {
  const { onChunk, onComplete, signal } = options;

  const mockResponses = [
    "I received your message. Let me think about this...\n\nHere's what I'd suggest:\n\n1. **Start with the basics** — understand the core problem\n2. **Break it down** into smaller, manageable steps\n3. **Iterate** and refine your approach\n\nWould you like me to elaborate on any of these points?",
    "That's an interesting question! Let me help you with that.\n\n```typescript\n// Here's a quick example\nfunction solve(input: string): string {\n  return input.trim().toLowerCase();\n}\n```\n\nThis approach keeps things simple and efficient. Let me know if you need more details!",
    "Great point! Here's my analysis:\n\n> The key insight is that we need to consider both performance and maintainability.\n\n- **Performance**: Use efficient data structures\n- **Maintainability**: Keep the code readable\n- **Testing**: Write comprehensive tests\n\nShall I dive deeper into any of these areas?",
  ];

  const response = mockResponses[Math.floor(Math.random() * mockResponses.length)];
  const chars = [...response];
  let index = 0;
  let accumulated = "";

  while (index < chars.length) {
    if (signal?.aborted) {
      onComplete(accumulated);
      return;
    }

    const chunkSize = Math.random() < 0.3 ? 3 : Math.random() < 0.5 ? 2 : 1;
    const chunk = chars.slice(index, index + chunkSize).join("");
    index += chunkSize;
    accumulated += chunk;
    onChunk(chunk);

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  onComplete(accumulated);
}
