"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, MessageCircle, SquarePen } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { ConversationList } from "./conversation-list";
import { PageTitle } from "@/components/ui/page-title";
import { useTranslation } from "@/lib/i18n";

export function Sidebar() {
  const { t } = useTranslation();
  const searchMessages = useChatStore((s) => s.searchMessages);
  const storeSearchQuery = useChatStore((s) => s.searchQuery);
  const [localQuery, setLocalQuery] = useState("");
  const composingRef = useRef(false);

  // Sync local input when store search is cleared (e.g. back from results)
  useEffect(() => {
    if (!storeSearchQuery && localQuery) {
      setLocalQuery("");
    }
  }, [storeSearchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

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
            onClick={() => window.dispatchEvent(new Event("arinova:new-chat"))}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            aria-label={t("chat.newChat")}
          >
            <SquarePen className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Search — always visible */}
      <div className="shrink-0 px-3 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder={t("chat.searchPlaceholder")}
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !composingRef.current && localQuery.trim()) {
                searchMessages(localQuery.trim());
              }
            }}
            className="h-9 w-full rounded-lg border-none bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Conversation list */}
      <ConversationList />
    </div>
  );
}
