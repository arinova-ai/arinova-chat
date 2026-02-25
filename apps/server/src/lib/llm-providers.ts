import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export interface LLMCallOptions {
  provider: string;
  modelId: string;
  apiKey: string;
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
  onChunk: (chunk: string) => void;
  onComplete: (fullContent: string) => void;
  onError: (error: string) => void;
}

export async function callLLM(options: LLMCallOptions): Promise<void> {
  const {
    provider,
    modelId,
    apiKey,
    systemPrompt,
    messages,
    onChunk,
    onComplete,
    onError,
  } = options;

  try {
    if (provider === "anthropic") {
      await callAnthropic({ modelId, apiKey, systemPrompt, messages, onChunk, onComplete, onError });
    } else {
      // Default to OpenAI-compatible API
      await callOpenAI({ modelId, apiKey, systemPrompt, messages, onChunk, onComplete, onError });
    }
  } catch (err) {
    console.error("[LLM] Provider error:", err instanceof Error ? err.message : err);
    onError("Failed to generate response");
  }
}

async function callOpenAI(opts: Omit<LLMCallOptions, "provider">) {
  const client = new OpenAI({ apiKey: opts.apiKey });
  const stream = await client.chat.completions.create({
    model: opts.modelId,
    stream: true,
    messages: [
      { role: "system", content: opts.systemPrompt },
      ...opts.messages,
    ],
  });

  let fullContent = "";
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      fullContent += delta;
      opts.onChunk(delta);
    }
  }
  opts.onComplete(fullContent);
}

async function callAnthropic(opts: Omit<LLMCallOptions, "provider">) {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const stream = client.messages.stream({
    model: opts.modelId,
    max_tokens: 4096,
    system: opts.systemPrompt,
    messages: opts.messages,
  });

  let fullContent = "";
  stream.on("text", (text) => {
    fullContent += text;
    opts.onChunk(text);
  });

  await stream.finalMessage();
  opts.onComplete(fullContent);
}

/** Validate an API key by making a lightweight test call. */
export async function validateApiKey(
  provider: string,
  apiKey: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey });
      await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      });
    } else {
      const client = new OpenAI({ apiKey });
      await client.models.list();
    }
    return { valid: true };
  } catch (err) {
    console.error("[LLM] API key validation error:", err instanceof Error ? err.message : err);
    return { valid: false, error: "API key validation failed" };
  }
}
