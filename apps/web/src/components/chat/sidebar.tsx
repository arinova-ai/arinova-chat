"use client";

import { useState, useEffect, useRef } from "react";
import { Search, MessageCircle } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { ConversationList } from "./conversation-list";
import { PageTitle } from "@/components/ui/page-title";

export function Sidebar() {
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
      <div className="shrink-0 px-4 pt-[env(safe-area-inset-top,0px)] pb-2">
        <PageTitle
          title="Chat"
          subtitle="Connect with your team instantly"
          icon={MessageCircle}
        />
      </div>

      {/* Search */}
      <div className="shrink-0 px-3 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Search conversations..."
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !composingRef.current && localQuery.trim()) {
                searchMessages(localQuery.trim());
              }
            }}
            className="h-9 w-full rounded-lg border-none bg-[oklch(0.2_0.03_260)] pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[oklch(0.6_0.15_250)]"
          />
        </div>
      </div>

      {/* Conversation list */}
      <ConversationList />
    </div>
  );
}
