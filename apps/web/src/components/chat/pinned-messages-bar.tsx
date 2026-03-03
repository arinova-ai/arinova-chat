"use client";

import { useCallback, useEffect, useState } from "react";
import { Pin, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface PinnedMessage {
  messageId: string;
  content: string;
  role: string;
  pinnedBy: string;
  pinnedByName: string;
  pinnedAt: string;
}

interface PinnedMessagesBarProps {
  conversationId: string;
}

export function PinnedMessagesBar({ conversationId }: PinnedMessagesBarProps) {
  const [pins, setPins] = useState<PinnedMessage[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const fetchPins = useCallback(async () => {
    if (!conversationId) return;
    try {
      const data = await api<PinnedMessage[]>(
        `/api/conversations/${conversationId}/pins`
      );
      setPins(data);
      setCurrentIndex(0);
    } catch {
      // Keep existing pins on refetch failure; only clear on initial load
    }
  }, [conversationId]);

  useEffect(() => {
    // Clear pins and fetch fresh on conversation change
    setPins([]);
    fetchPins();
    const onPinsChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.conversationId === conversationId) {
        fetchPins();
      }
    };
    window.addEventListener("pins-changed", onPinsChanged);
    return () => window.removeEventListener("pins-changed", onPinsChanged);
  }, [fetchPins, conversationId]);

  const handleUnpin = useCallback(
    async (messageId: string) => {
      try {
        await api(
          `/api/conversations/${conversationId}/pin/${messageId}`,
          { method: "DELETE" }
        );
        setPins((prev) => prev.filter((p) => p.messageId !== messageId));
        window.dispatchEvent(
          new CustomEvent("pins-changed", {
            detail: { conversationId },
          })
        );
      } catch {
        // unpin failed
      }
    },
    [conversationId]
  );

  const scrollToMessage = useCallback((messageId: string) => {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-yellow-400/50");
      setTimeout(() => el.classList.remove("ring-2", "ring-yellow-400/50"), 2000);
    }
  }, []);

  if (pins.length === 0) return null;

  const currentPin = pins[currentIndex];

  // Collapsed: single-line Telegram-style bar
  if (!expanded) {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-4 py-1.5">
        <Pin className="h-3.5 w-3.5 shrink-0 text-yellow-400" />
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-xs text-foreground hover:underline"
          onClick={() => scrollToMessage(currentPin.messageId)}
        >
          <span className="font-medium text-yellow-400/80">
            Pinned #{pins.length - currentIndex}
          </span>{" "}
          <span className="text-muted-foreground">{currentPin.content}</span>
        </button>
        <div className="flex items-center gap-0.5">
          {pins.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                className="h-5 w-5"
                onClick={() =>
                  setCurrentIndex((i) => (i + 1) % pins.length)
                }
              >
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                className="h-5 w-5"
                onClick={() =>
                  setCurrentIndex(
                    (i) => (i - 1 + pins.length) % pins.length
                  )
                }
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            className="h-5 w-5"
            onClick={() => setExpanded(true)}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  // Expanded: show all pinned messages
  return (
    <div className="border-b border-border bg-secondary/50">
      <div className="flex items-center justify-between px-4 py-1.5">
        <div className="flex items-center gap-2 text-xs font-medium text-yellow-400">
          <Pin className="h-3.5 w-3.5" />
          <span>
            {pins.length} pinned message{pins.length !== 1 ? "s" : ""}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          className="h-5 w-5"
          onClick={() => setExpanded(false)}
        >
          <ChevronUp className="h-3 w-3" />
        </Button>
      </div>
      <div className="max-h-48 overflow-y-auto px-2 pb-2">
        {pins.map((pin) => (
          <div
            key={pin.messageId}
            className={cn(
              "group/pin flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/50"
            )}
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => scrollToMessage(pin.messageId)}
            >
              <p className="text-xs font-medium text-muted-foreground">
                {pin.pinnedByName}
              </p>
              <p className="line-clamp-2 text-xs text-foreground">
                {pin.content}
              </p>
            </button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="h-5 w-5 shrink-0 opacity-0 group-hover/pin:opacity-100"
              onClick={() => handleUnpin(pin.messageId)}
              title="Unpin"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
