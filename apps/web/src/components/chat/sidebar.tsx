"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, MessageCircle, SquarePen, X } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { ConversationList } from "./conversation-list";
import { PageTitle } from "@/components/ui/page-title";
import { useTranslation } from "@/lib/i18n";

export function Sidebar() {
  const { t } = useTranslation();
  const searchMessages = useChatStore((s) => s.searchMessages);
  const storeSearchQuery = useChatStore((s) => s.searchQuery);
  const [localQuery, setLocalQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const composingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync local input when store search is cleared (e.g. back from results)
  useEffect(() => {
    if (!storeSearchQuery && localQuery) {
      setLocalQuery("");
      setSearchOpen(false);
    }
  }, [storeSearchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus input when search opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [searchOpen]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setLocalQuery("");
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      {/* Header */}
      <div className="shrink-0 px-4 pb-2 flex items-start justify-between">
        <PageTitle
          title={t("nav.chat")}
          subtitle={t("chat.subtitle")}
          icon={MessageCircle}
        />
        <div className="flex items-center gap-0.5 mt-1">
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            aria-label={t("chat.searchPlaceholder")}
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("arinova:new-chat"))}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            aria-label={t("chat.newChat")}
          >
            <SquarePen className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Search — expandable */}
      {searchOpen && (
        <div className="shrink-0 px-3 pb-3">
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                placeholder={t("chat.searchPlaceholder")}
                value={localQuery}
                onChange={(e) => setLocalQuery(e.target.value)}
                onCompositionStart={() => { composingRef.current = true; }}
                onCompositionEnd={() => { composingRef.current = false; }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !composingRef.current && localQuery.trim()) {
                    searchMessages(localQuery.trim());
                  }
                  if (e.key === "Escape") {
                    closeSearch();
                  }
                }}
                className="h-9 w-full rounded-lg border-none bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <button
              type="button"
              onClick={closeSearch}
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Conversation list */}
      <ConversationList />
    </div>
  );
}
