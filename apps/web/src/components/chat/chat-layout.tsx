"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { IconRail } from "./icon-rail";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { Sidebar } from "./sidebar";
import { ChatArea } from "./chat-area";
import { NewChatDialog } from "./new-chat-dialog";
import { CallIndicator } from "@/components/voice/call-indicator";
import { NotificationBanner } from "@/components/notification-banner";
import { useChatStore } from "@/store/chat-store";
import { authClient } from "@/lib/auth-client";
import { initVoiceTTSIntegration } from "@/lib/voice-tts-integration";
import { refreshPushSubscription, setupNotificationClickHandler } from "@/lib/push";
import { initChatDiagnostics, useRenderDiag } from "@/lib/chat-diagnostics";
import { ErrorBoundary } from "./error-boundary";

const SIDEBAR_COLLAPSED_KEY = "arinova:sidebar-collapsed";

export function ChatLayout() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const searchActive = useChatStore((s) => s.searchActive);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const jumpToMessage = useChatStore((s) => s.jumpToMessage);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const setCurrentUserId = useChatStore((s) => s.setCurrentUserId);
  const prevConvRef = useRef<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Desktop sidebar collapse state (persisted in localStorage)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  });
  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };
  useRenderDiag("ChatLayout", () => ({
    activeConversationId,
    searchActive,
    newChatOpen,
  }));

  // Sync current user ID into the store for message ownership checks
  const { data: session } = authClient.useSession();
  useEffect(() => {
    setCurrentUserId(session?.user?.id ?? null);
  }, [session?.user?.id, setCurrentUserId]);

  useEffect(() => {
    initChatDiagnostics();
    const state = useChatStore.getState();
    state.loadAgents();
    state.loadConversations();
    state.loadAgentHealth();
    const cleanup = state.initWS();
    const cleanupTTS = initVoiceTTSIntegration();

    // Refresh agent health every 30s
    const healthInterval = setInterval(() => {
      useChatStore.getState().loadAgentHealth();
    }, 30_000);

    return () => {
      cleanup();
      cleanupTTS();
      clearInterval(healthInterval);
    };
  }, []);

  // Handle ?c= and ?m= query params from push notification deep links
  useEffect(() => {
    const convId = searchParams.get("c");
    const msgId = searchParams.get("m");
    if (convId) {
      if (msgId) {
        jumpToMessage(convId, msgId);
      } else {
        setActiveConversation(convId);
      }
      router.replace("/", { scroll: false });
    }
  }, [searchParams, setActiveConversation, jumpToMessage, router]);

  // Push notification setup: refresh subscription + wire click handler
  useEffect(() => {
    refreshPushSubscription();
    const cleanup = setupNotificationClickHandler((url) => {
      const params = new URLSearchParams(url.split("?")[1] || "");
      const convId = params.get("c");
      const msgId = params.get("m");
      if (convId) {
        if (msgId) {
          jumpToMessage(convId, msgId);
        } else {
          setActiveConversation(convId);
        }
      } else {
        router.push(url);
      }
    });
    return cleanup;
  }, [router, setActiveConversation, jumpToMessage]);

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
      <div
        className="hidden h-full shrink-0 overflow-hidden border-r border-border md:block transition-[width] duration-300 ease-in-out"
        style={{ width: sidebarCollapsed ? 72 : 288 }}
      >
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />
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
      <div className={`h-full flex-1 min-w-0 flex flex-col bg-background ${(activeConversationId || searchActive) ? "" : "hidden md:flex md:flex-col"}`}>
        <ErrorBoundary>
          <NotificationBanner />
          <div className="flex-1 min-h-0 h-full">
            <ChatArea />
          </div>
        </ErrorBoundary>
      </div>

      {/* Floating call indicator (visible when navigating away from active call) */}
      <CallIndicator />
    </div>
  );
}
