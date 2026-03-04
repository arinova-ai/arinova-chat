"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { PageTitle } from "@/components/ui/page-title";
import { UserPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/chat-store";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { UserSearch } from "@/components/friends/user-search";
import { FriendsPanel } from "@/components/friends/friends-panel";
import { PendingRequests } from "@/components/friends/pending-requests";

type TabId = "friends" | "requests";

function FriendsContent() {
  const router = useRouter();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>("friends");
  const [showAddFriend, setShowAddFriend] = useState(false);
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
    { id: "friends", label: t("friends.tabFriends") },
    { id: "requests", label: t("friends.tabRequests"), badge: pendingCount },
  ];

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <PageTitle
              icon={UserPlus}
              title={t("friends.title")}
              subtitle={t("friends.subtitle")}
            />
            <Button
              size="sm"
              className="brand-gradient-btn gap-1"
              onClick={() => {
                setShowAddFriend((v) => !v);
                if (!showAddFriend) setActiveTab("friends");
              }}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{t("friends.tabAdd")}</span>
            </Button>
          </div>

          {/* Tab bar */}
          <div className="mt-3 flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setActiveTab(tab.id); setShowAddFriend(false); }}
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
          {showAddFriend ? (
            <UserSearch />
          ) : activeTab === "friends" ? (
            <FriendsPanel onStartConversation={handleStartConversation} />
          ) : activeTab === "requests" ? (
            <PendingRequests onCountChange={handlePendingCountChange} />
          ) : null}
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
