"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { PageTitle } from "@/components/ui/page-title";
import { UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/chat-store";
import { api } from "@/lib/api";
import { UserSearch } from "@/components/friends/user-search";
import { FriendsPanel } from "@/components/friends/friends-panel";
import { PendingRequests } from "@/components/friends/pending-requests";

type TabId = "friends" | "requests" | "add";

function FriendsContent() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("friends");
  const [pendingCount, setPendingCount] = useState(0);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const loadConversations = useChatStore((s) => s.loadConversations);

  useEffect(() => {
    api<{ incoming: unknown[] }>("/api/friends/requests")
      .then((data) => setPendingCount(data.incoming.length))
      .catch(() => {});
  }, []);

  const handleStartConversation = useCallback(
    async (conversationId: string) => {
      await loadConversations();
      setActiveConversation(conversationId);
      router.push("/");
    },
    [loadConversations, setActiveConversation, router]
  );

  const handlePendingCountChange = useCallback((count: number) => {
    setPendingCount(count);
  }, []);

  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: "friends", label: "Friends" },
    { id: "requests", label: "Requests", badge: pendingCount },
    { id: "add", label: "Add Friend" },
  ];

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-4 py-3">
          <PageTitle
            icon={UserPlus}
            title="Friends"
            subtitle="Connect and socialize"
          />

          {/* Tab bar */}
          <div className="mt-3 flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-brand text-white"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                {tab.badge != null && tab.badge > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-medium text-white">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {activeTab === "friends" && (
            <FriendsPanel onStartConversation={handleStartConversation} />
          )}
          {activeTab === "requests" && (
            <PendingRequests onCountChange={handlePendingCountChange} />
          )}
          {activeTab === "add" && <UserSearch />}
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function FriendsPage() {
  return (
    <AuthGuard>
      <FriendsContent />
    </AuthGuard>
  );
}
