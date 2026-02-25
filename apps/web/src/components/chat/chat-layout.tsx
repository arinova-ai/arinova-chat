"use client";

import { useState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { IconRail } from "./icon-rail";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { Sidebar } from "./sidebar";
import { ChatArea } from "./chat-area";
import { NewChatDialog } from "./new-chat-dialog";
import { CallIndicator } from "@/components/voice/call-indicator";
import { NotificationBanner } from "@/components/notification-banner";
import { useChatStore } from "@/store/chat-store";
import { initVoiceTTSIntegration } from "@/lib/voice-tts-integration";

export function ChatLayout() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const searchActive = useChatStore((s) => s.searchActive);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const [newChatOpen, setNewChatOpen] = useState(false);
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
    const cleanupTTS = initVoiceTTSIntegration();

    // Refresh agent health every 30s
    const healthInterval = setInterval(loadAgentHealth, 30_000);

    return () => {
      cleanup();
      cleanupTTS();
      clearInterval(healthInterval);
    };
  }, [loadAgents, loadConversations, loadAgentHealth, initWS]);

  // Listen for global new-chat event (e.g. from sidebar header button)
  useEffect(() => {
    const handler = () => setNewChatOpen(true);
    window.addEventListener("arinova:new-chat", handler);
    return () => window.removeEventListener("arinova:new-chat", handler);
  }, []);

  // Manage browser history for mobile back-swipe navigation
  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (!isMobile) return;

    if ((activeConversationId || searchActive) && !prevConvRef.current) {
      // Entering a conversation or search → push history entry
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
    <div className={`app-dvh flex min-h-0 overflow-hidden ${(activeConversationId || searchActive) ? "bg-background" : "bg-card md:bg-background"}`}>
      {/* Desktop: Icon Rail */}
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      {/* Desktop: Conversation panel */}
      <div className="hidden h-full w-72 shrink-0 overflow-hidden border-r border-border md:block">
        <Sidebar />
      </div>

      {/* Mobile: sidebar + bottom nav when no conversation/search, chat when selected */}
      <div className={`md:hidden h-full overflow-hidden bg-card flex flex-col ${(activeConversationId || searchActive) ? "hidden" : "flex-1"}`}>
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <Sidebar />
          {/* New Chat FAB — mobile only, chat list view */}
          <button
            type="button"
            onClick={() => setNewChatOpen(true)}
            className="absolute right-4 bottom-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-gradient-end shadow-lg shadow-blue-500/30 active:scale-95 transition-transform"
            aria-label="New chat"
          >
            <Plus className="h-6 w-6 text-white" />
          </button>
        </div>
        <MobileBottomNav />
      </div>

      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} />

      {/* Chat area: always visible on desktop, show on mobile when conversation or search active */}
      <div className={`h-full flex-1 min-w-0 flex flex-col bg-background ${(activeConversationId || searchActive) ? "" : "hidden md:block"}`}>
        <NotificationBanner />
        <div className="flex-1 min-h-0">
          <ChatArea />
        </div>
      </div>

      {/* Floating call indicator (visible when navigating away from active call) */}
      <CallIndicator />
    </div>
  );
}
