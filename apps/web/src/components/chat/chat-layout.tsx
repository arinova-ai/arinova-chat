"use client";

import { useEffect, useRef } from "react";
import { Sidebar } from "./sidebar";
import { ChatArea } from "./chat-area";
import { useChatStore } from "@/store/chat-store";

export function ChatLayout() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const loadAgents = useChatStore((s) => s.loadAgents);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const loadAgentHealth = useChatStore((s) => s.loadAgentHealth);
  const initWS = useChatStore((s) => s.initWS);
  const prevConvRef = useRef<string | null>(null);

  useEffect(() => {
    loadAgents();
    loadConversations();
    loadAgentHealth();
    const cleanup = initWS();

    // Refresh agent health every 30s
    const healthInterval = setInterval(loadAgentHealth, 30_000);

    return () => {
      cleanup();
      clearInterval(healthInterval);
    };
  }, [loadAgents, loadConversations, loadAgentHealth, initWS]);

  // Manage browser history for mobile back-swipe navigation
  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (!isMobile) return;

    if (activeConversationId && !prevConvRef.current) {
      // Entering a conversation → push history entry
      history.pushState({ arinovaChat: true }, "");
    } else if (!activeConversationId && prevConvRef.current) {
      // Leaving a conversation via UI (back button) — no action needed
    }
    prevConvRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      const isMobile = window.matchMedia("(max-width: 767px)").matches;
      if (!isMobile) return;

      const current = useChatStore.getState().activeConversationId;
      if (current) {
        // Intercept back navigation: go to chat list instead of leaving the page
        e.preventDefault();
        setActiveConversation(null);
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [setActiveConversation]);

  return (
    <div className="app-dvh flex min-h-0 overflow-hidden">
      {/* Desktop: always show sidebar */}
      <div className="hidden h-full w-80 shrink-0 overflow-hidden border-r border-border md:block">
        <Sidebar />
      </div>

      {/* Mobile: sidebar fullscreen when no conversation, chat when selected */}
      <div className={`md:hidden h-full overflow-hidden bg-card ${activeConversationId ? "hidden" : "flex-1"}`}>
        <Sidebar />
      </div>

      {/* Chat area: always visible on desktop, only when conversation selected on mobile */}
      <div className={`h-full flex-1 min-w-0 bg-background ${activeConversationId ? "" : "hidden md:block"}`}>
        <ChatArea />
      </div>
    </div>
  );
}
