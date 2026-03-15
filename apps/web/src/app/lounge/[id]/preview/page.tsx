"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { useAccountStore } from "@/store/account-store";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export default function PreviewChatPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const accountId = params.id as string;

  const { sendPreviewMessage, loadPreviewMessages, clearPreview } =
    useAccountStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    async function load() {
      const existing = await loadPreviewMessages(accountId);
      setMessages(existing as Message[]);
    }
    load();
  }, [accountId, loadPreviewMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || sending) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);

    try {
      const assistantMessage = await sendPreviewMessage(accountId, content) as Message;
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setSending(false);
    }
  }, [input, sending, accountId, sendPreviewMessage]);

  const handleClear = useCallback(async () => {
    if (!window.confirm(t("lounge.preview.clearConfirm"))) return;
    await clearPreview(accountId);
    setMessages([]);
  }, [accountId, clearPreview, t]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">
            {t("lounge.preview.title")}
          </h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClear}
          aria-label={t("lounge.preview.clear")}
        >
          <Trash2 className="h-5 w-5" />
        </Button>
      </header>

      {/* Messages */}
      <div
        ref={chatContainerRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {t("lounge.preview.noMessages")}
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex flex-col gap-1",
                msg.role === "user" ? "items-end" : "items-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                  msg.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                )}
              >
                {msg.content}
              </div>
              <span className="text-xs text-muted-foreground">
                {formatTime(msg.createdAt)}
              </span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Sending note */}
      {sending && (
        <div className="px-4 pb-1 text-xs text-muted-foreground">
          {t("lounge.preview.sendingNote")}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-center gap-2 border-t px-4 py-3">
        <input
          type="text"
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder={t("lounge.preview.placeholder")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!input.trim() || sending}
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
