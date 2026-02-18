"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Eye, RotateCcw, Check } from "lucide-react";
import { api } from "@/lib/api";
import { usePlaygroundStore } from "@/store/playground-store";
import type { PlaygroundDefinition } from "@arinova/shared/types";
import { PlaygroundDefinitionPreview } from "./playground-definition-preview";

interface Message {
  role: "user" | "assistant";
  content: string;
  definition?: PlaygroundDefinition;
}

interface CreatePlaygroundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}

export function CreatePlaygroundDialog({
  open,
  onOpenChange,
  onCreated,
}: CreatePlaygroundDialogProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewDef, setPreviewDef] = useState<PlaygroundDefinition | null>(null);
  const [publishing, setPublishing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadPlaygrounds = usePlaygroundStore((s) => s.loadPlaygrounds);

  useEffect(() => {
    if (open) {
      setMessages([]);
      setInput("");
      setPreviewDef(null);
    }
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await api<{ message: string; definition?: PlaygroundDefinition }>(
        "/api/playgrounds/generate",
        {
          method: "POST",
          body: JSON.stringify({
            messages: [...messages, userMsg].map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        },
      );

      const assistantMsg: Message = {
        role: "assistant",
        content: res.message,
        definition: res.definition,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (res.definition) {
        setPreviewDef(res.definition);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!previewDef || publishing) return;
    setPublishing(true);
    try {
      const pg = await api<{ id: string }>("/api/playgrounds", {
        method: "POST",
        body: JSON.stringify({ definition: previewDef, isPublic: true }),
      });
      loadPlaygrounds(1);
      onOpenChange(false);
      onCreated?.(pg.id);
    } finally {
      setPublishing(false);
    }
  };

  const handleRevise = () => {
    setPreviewDef(null);
    setInput("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle>Create Playground</DialogTitle>
        </DialogHeader>

        {previewDef ? (
          /* Preview mode */
          <div className="flex flex-1 flex-col overflow-hidden">
            <ScrollArea className="flex-1 p-6">
              <PlaygroundDefinitionPreview definition={previewDef} />
            </ScrollArea>
            <div className="shrink-0 flex gap-2 border-t border-border p-4">
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={handleRevise}
              >
                <RotateCcw className="h-4 w-4" />
                Revise
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={handlePublish}
                disabled={publishing}
              >
                {publishing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Publish
              </Button>
            </div>
          </div>
        ) : (
          /* Chat mode */
          <div className="flex flex-1 flex-col overflow-hidden">
            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-6">
              {messages.length === 0 && (
                <p className="text-center text-sm text-muted-foreground">
                  Describe the playground you want to create. For example: &quot;A werewolf-style game for 6-10 players&quot; or &quot;A collaborative drawing challenge&quot;.
                </p>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={
                    msg.role === "user"
                      ? "ml-auto max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "mr-auto max-w-[80%] rounded-lg bg-neutral-800 px-3 py-2 text-sm"
                  }
                >
                  {msg.content}
                  {msg.definition && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="mt-2 gap-1"
                      onClick={() => setPreviewDef(msg.definition!)}
                    >
                      <Eye className="h-3 w-3" />
                      Preview
                    </Button>
                  )}
                </div>
              ))}
              {loading && (
                <div className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-border p-4">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Describe your playground..."
                  className="bg-neutral-800 border-none"
                  disabled={loading}
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
