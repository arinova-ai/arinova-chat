"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { api } from "@/lib/api";
import { BACKEND_URL } from "@/lib/config";
import { useTranslation } from "@/lib/i18n";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import { ArinovaSpinner } from "@/components/ui/arinova-spinner";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Coins, Send, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface AskRecord {
  id: string;
  question: string;
  answer: string | null;
  cost: number;
  rating: number | null;
  createdAt: string;
}

const MAX_CHARS = 500;

function ExpertChatContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const expertId = params.id as string;

  const [expertName, setExpertName] = useState("");
  const [price, setPrice] = useState(0);
  const [history, setHistory] = useState<AskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load expert info + history
  useEffect(() => {
    if (!expertId) return;
    setLoading(true);
    Promise.all([
      api<{ name: string; pricePerAsk: number }>(`/api/expert-hub/${expertId}`),
      api<{ asks: AskRecord[] }>(`/api/expert-hub/${expertId}/history`),
    ])
      .then(([expert, hist]) => {
        setExpertName(expert.name);
        setPrice(expert.pricePerAsk);
        setHistory(hist.asks.reverse()); // oldest first
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [expertId]);

  // Auto-scroll on new content
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, streamingAnswer]);

  const handleAsk = useCallback(async () => {
    if (!question.trim() || streaming) return;
    setConfirmOpen(false);
    setStreaming(true);
    setStreamingAnswer("");

    const q = question.trim();
    setQuestion("");

    // Add optimistic question entry
    const tempId = `temp-${Date.now()}`;
    setHistory((prev) => [...prev, { id: tempId, question: q, answer: null, cost: price, rating: null, createdAt: new Date().toISOString() }]);

    try {
      const res = await fetch(`${BACKEND_URL}/api/expert-hub/${expertId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question: q }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as Record<string, string>).error ?? `Error ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullContent = "";
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // Parse SSE lines
        while (buf.includes("\n")) {
          const pos = buf.indexOf("\n");
          const line = buf.slice(0, pos).trim();
          buf = buf.slice(pos + 1);

          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "chunk" && data.content) {
                fullContent += data.content;
                setStreamingAnswer(fullContent);
              } else if (data.type === "done") {
                fullContent = data.content ?? fullContent;
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }

      // Replace temp entry with real answer
      setHistory((prev) =>
        prev.map((h) =>
          h.id === tempId ? { ...h, answer: fullContent } : h
        )
      );
    } catch (err) {
      // Remove temp entry on error
      setHistory((prev) => prev.filter((h) => h.id !== tempId));
      const msg = err instanceof Error ? err.message : "Ask failed";
      // Show error inline
      setStreamingAnswer(`Error: ${msg}`);
      setTimeout(() => setStreamingAnswer(""), 3000);
    } finally {
      setStreaming(false);
      setStreamingAnswer("");
    }
  }, [question, streaming, expertId, price]);

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold truncate">{expertName || t("expertHub.chat.title")}</h1>
          </div>
          <span className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground">
            <Coins className="h-3.5 w-3.5" /> {price} / {t("expertHub.chat.perAsk")}
          </span>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-12"><ArinovaSpinner size="sm" /></div>
          ) : history.length === 0 && !streaming ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("expertHub.chat.empty")}</p>
          ) : (
            <>
              {history.map((h) => (
                <div key={h.id} className="space-y-2">
                  {/* Question — right aligned */}
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand text-white px-4 py-2.5">
                      <p className="text-sm whitespace-pre-wrap">{h.question}</p>
                    </div>
                  </div>
                  {/* Answer — left aligned */}
                  {h.answer != null && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-secondary px-4 py-2.5">
                        <p className="text-sm whitespace-pre-wrap">{h.answer}</p>
                        {/* Rating */}
                        {h.answer && !h.rating && (
                          <div className="flex gap-1 mt-1">
                            {[1,2,3,4,5].map(star => (
                              <button key={star} type="button" className="text-muted-foreground hover:text-yellow-400 transition-colors"
                                onClick={async () => {
                                  await api(`/api/expert-hub/asks/${h.id}/rate`, { method: "PATCH", body: JSON.stringify({ rating: star }) });
                                  setHistory(prev => prev.map(a => a.id === h.id ? { ...a, rating: star } : a));
                                }}
                              >
                                <Star className="h-4 w-4" />
                              </button>
                            ))}
                          </div>
                        )}
                        {h.rating && (
                          <div className="flex gap-0.5 mt-1">
                            {[1,2,3,4,5].map(star => (
                              <Star key={star} className={`h-3.5 w-3.5 ${star <= h.rating! ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"}`} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {/* Streaming answer */}
              {streaming && streamingAnswer && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-secondary px-4 py-2.5">
                    <p className="text-sm whitespace-pre-wrap">{streamingAnswer}<span className="animate-pulse">▌</span></p>
                  </div>
                </div>
              )}
              {streaming && !streamingAnswer && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm bg-secondary px-4 py-2.5">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border px-4 py-3 pb-24 md:pb-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value.slice(0, MAX_CHARS))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && question.trim()) {
                    e.preventDefault();
                    setConfirmOpen(true);
                  }
                }}
                placeholder={t("expertHub.chat.placeholder")}
                rows={2}
                disabled={streaming}
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 pr-12 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              />
              <span className={cn(
                "absolute bottom-2 right-3 text-[10px]",
                question.length >= MAX_CHARS ? "text-red-400" : "text-muted-foreground/50"
              )}>
                {question.length}/{MAX_CHARS}
              </span>
            </div>
            <Button
              size="icon"
              className="shrink-0 h-10 w-10"
              disabled={!question.trim() || streaming}
              onClick={() => setConfirmOpen(true)}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <MobileBottomNav />
      </div>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle>{t("expertHub.chat.confirmTitle")}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t("expertHub.chat.confirmDesc", { price })}</p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>{t("common.cancel")}</Button>
            <Button size="sm" onClick={handleAsk}>{t("expertHub.chat.confirmAsk")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ExpertChatPage() {
  return (
    <AuthGuard>
      <ExpertChatContent />
    </AuthGuard>
  );
}
