"use client";

import { useEffect, useRef } from "react";
import { Sidebar } from "./sidebar";
import { ChatArea } from "./chat-area";
import { ConnectionBanner } from "./connection-banner";
import { ErrorBoundary } from "./error-boundary";
import { useChatStore } from "@/store/chat-store";

export function ChatLayout() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const searchActive = useChatStore((s) => s.searchActive);
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

    if ((activeConversationId || searchActive) && !prevConvRef.current) {
      history.pushState({ arinovaChat: true }, "");
    }
    prevConvRef.current = activeConversationId || (searchActive ? "__search__" : null);
  }, [activeConversationId, searchActive]);

  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      const isMobile = window.matchMedia("(max-width: 767px)").matches;
      if (!isMobile) return;

      const state = useChatStore.getState();
      if (state.activeConversationId) {
        e.preventDefault();
        setActiveConversation(null);
      } else if (state.searchActive) {
        e.preventDefault();
        state.clearSearch();
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [setActiveConversation]);

  return (
    <ErrorBoundary>
      <div className={`app-dvh flex flex-col min-h-0 overflow-hidden ${(activeConversationId || searchActive) ? "bg-background" : "bg-card md:bg-background"}`}>
        <ConnectionBanner />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Desktop: always show sidebar */}
          <div className="hidden h-full w-80 shrink-0 overflow-hidden border-r border-border md:block">
            <Sidebar />
          </div>

          {/* Mobile: sidebar fullscreen when no conversation/search, chat when selected */}
          <div className={`md:hidden h-full overflow-hidden bg-card ${(activeConversationId || searchActive) ? "hidden" : "flex-1"}`}>
            <Sidebar />
          </div>

          {/* Chat area: always visible on desktop, show on mobile when conversation or search active */}
          <div className={`h-full flex-1 min-w-0 bg-background ${(activeConversationId || searchActive) ? "" : "hidden md:block"}`}>
            <ChatArea />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
