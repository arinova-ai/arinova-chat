"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/chat-store";
import { api } from "@/lib/api";
import { UserSearch } from "./user-search";
import { FriendsPanel } from "./friends-panel";
import { PendingRequests } from "./pending-requests";

type TabId = "friends" | "requests" | "add";

interface FriendsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: TabId;
}

export function FriendsDialog({
  open,
  onOpenChange,
  initialTab = "friends",
}: FriendsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [pendingCount, setPendingCount] = useState(0);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const loadConversations = useChatStore((s) => s.loadConversations);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      // Fetch pending count
      api<{ incoming: unknown[] }>("/api/friends/requests")
        .then((data) => setPendingCount(data.incoming.length))
        .catch(() => {});
    }
  }, [open, initialTab]);

  const handleStartConversation = useCallback(
    async (conversationId: string) => {
      await loadConversations();
      setActiveConversation(conversationId);
      onOpenChange(false);
    },
    [loadConversations, setActiveConversation, onOpenChange]
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Friends</DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 rounded-lg bg-neutral-800/50 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors relative",
                activeTab === tab.id
                  ? "bg-neutral-700 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
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

        {/* Tab content */}
        <div className="min-h-[200px]">
          {activeTab === "friends" && (
            <FriendsPanel onStartConversation={handleStartConversation} />
          )}
          {activeTab === "requests" && (
            <PendingRequests onCountChange={handlePendingCountChange} />
          )}
          {activeTab === "add" && <UserSearch />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
