"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { BACKEND_URL } from "@/lib/config";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  Send,
  Coins,
  AlertCircle,
} from "lucide-react";

interface AgentListing {
  id: string;
  agentName: string;
  avatarUrl: string | null;
  pricePerMessage: number;
  freeTrialMessages: number;
}

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
}

function MarketplaceChatContent() {
  const { id: agentListingId } = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<AgentListing | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load agent info
  useEffect(() => {
    (async () => {
      try {
        const data = await api<AgentListing>(
          `/api/marketplace/agents/${agentListingId}`
        );
        setAgent(data);
      } catch {
        // auto-handled
      } finally {
        setLoading(false);
      }
    })();
  }, [agentListingId]);

  // Abort streaming on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    // Abort any previous streaming request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setInput("");
    setError(null);
    setStreaming(true);

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    // Add empty assistant message for streaming
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/marketplace/agents/${agentListingId}/chat`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            conversationId: conversationIdRef.current ?? undefined,
          }),
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6);
          try {
            const event = JSON.parse(json);

            if (event.type === "meta") {
              conversationIdRef.current = event.conversationId;
            } else if (event.type === "chunk") {
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last.role === "assistant") {
                  copy[copy.length - 1] = {
                    ...last,
                    content: last.content + event.content,
                  };
                }
                return copy;
              });
            } else if (event.type === "done") {
              // done
            } else if (event.type === "error") {
              setError(event.error);
              // Remove empty assistant placeholder
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && !last.content) {
                  return prev.slice(0, -1);
                }
                return prev;
              });
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Failed to send message";
      setError(msg);
      // Remove the empty assistant message
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, agentListingId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-muted-foreground">
            Agent not found
          </p>
          <Button
            variant="secondary"
            onClick={() => router.push("/marketplace")}
          >
            Back to Marketplace
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Chat header */}
        <div className="shrink-0 border-b border-border px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push(`/marketplace/${agentListingId}`)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {agent.avatarUrl ? (
            <img
              src={agent.avatarUrl}
              alt={agent.agentName}
              className="h-8 w-8 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-sm font-bold text-brand-text">
              {agent.agentName[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold truncate">{agent.agentName}</h2>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Coins className="h-3 w-3 text-yellow-500" />
              {agent.pricePerMessage === 0
                ? "Free"
                : `${agent.pricePerMessage} credits/msg`}
              {agent.freeTrialMessages > 0 &&
                ` · ${agent.freeTrialMessages} free`}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push("/wallet")}
            className="text-xs gap-1"
          >
            <Coins className="h-3.5 w-3.5 text-yellow-500" />
            Wallet
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-2">
              {agent.avatarUrl ? (
                <img
                  src={agent.avatarUrl}
                  alt={agent.agentName}
                  className="h-16 w-16 rounded-2xl object-cover opacity-60"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 text-2xl font-bold text-brand-text/60">
                  {agent.agentName[0]}
                </div>
              )}
              <p className="text-sm font-medium">Start chatting with {agent.agentName}</p>
              <p className="text-xs max-w-xs">
                Type a message below to begin the conversation
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-brand text-white rounded-br-md"
                    : "bg-card border border-border rounded-bl-md"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                {msg.role === "assistant" && !msg.content && streaming && (
                  <span className="streaming-dot inline-flex gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                  </span>
                )}
              </div>
            </div>
          ))}

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
              {error.includes("Insufficient") && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="ml-auto text-xs"
                  onClick={() => router.push("/wallet")}
                >
                  Top Up
                </Button>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border p-3 pb-24 md:pb-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              style={{ maxHeight: 120 }}
            />
            <Button
              size="sm"
              className="brand-gradient-btn h-10 w-10 shrink-0 rounded-xl p-0"
              disabled={!input.trim() || streaming}
              onClick={sendMessage}
            >
              {streaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function MarketplaceChatPage() {
  return (
    <AuthGuard>
      <MarketplaceChatContent />
    </AuthGuard>
  );
}
