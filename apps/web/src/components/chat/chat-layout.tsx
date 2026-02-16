"use client";

import { useEffect } from "react";
import { Sidebar } from "./sidebar";
import { ChatArea } from "./chat-area";
import { useChatStore } from "@/store/chat-store";

export function ChatLayout() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const loadAgents = useChatStore((s) => s.loadAgents);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const initWS = useChatStore((s) => s.initWS);

  useEffect(() => {
    loadAgents();
    loadConversations();
    const cleanup = initWS();
    return cleanup;
  }, [loadAgents, loadConversations, initWS]);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop: always show sidebar */}
      <div className="hidden w-80 shrink-0 overflow-hidden border-r border-border md:block">
        <Sidebar />
      </div>

      {/* Mobile: sidebar fullscreen when no conversation, chat when selected */}
      <div className={`md:hidden overflow-hidden ${activeConversationId ? "hidden" : "flex-1"}`}>
        <Sidebar />
      </div>

      {/* Chat area: always visible on desktop, only when conversation selected on mobile */}
      <div className={`flex-1 min-w-0 ${activeConversationId ? "" : "hidden md:block"}`}>
        <ChatArea />
      </div>
    </div>
  );
}
