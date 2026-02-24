"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Search, Plus, LogOut, Settings, Users } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { ConversationList } from "./conversation-list";
import { NewChatDialog } from "./new-chat-dialog";
import { FriendsDialog } from "../friends/friends-dialog";

export function Sidebar() {
  const searchMessages = useChatStore((s) => s.searchMessages);
  const storeSearchQuery = useChatStore((s) => s.searchQuery);
  const [localQuery, setLocalQuery] = useState("");
  const composingRef = useRef(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const router = useRouter();

  // Fetch pending friend request count on mount and periodically
  useEffect(() => {
    const fetchCount = () => {
      api<{ incoming: unknown[] }>("/api/friends/requests")
        .then((data) => setPendingRequestCount(data.incoming.length))
        .catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Sync local input when store search is cleared (e.g. back from results)
  useEffect(() => {
    if (!storeSearchQuery && localQuery) {
      setLocalQuery("");
    }
  }, [storeSearchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for platform command "/new" to open the new chat dialog
  useEffect(() => {
    const handler = () => setNewChatOpen(true);
    window.addEventListener("arinova:new-chat", handler);
    return () => window.removeEventListener("arinova:new-chat", handler);
  }, []);

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      {/* Header */}
      <div className="flex min-h-[62px] shrink-0 items-center justify-between px-4 pt-[env(safe-area-inset-top,0px)]">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Arinova" className="h-6 w-6" />
          <h1 className="text-base font-bold">Arinova Chat</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setFriendsOpen(true)}
            className="h-8 w-8 relative"
            title="Friends"
          >
            <Users className="h-4 w-4" />
            {pendingRequestCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-medium text-white">
                {pendingRequestCount}
              </span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/settings")}
            className="h-8 w-8"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Separator />

      {/* Search */}
      <div className="shrink-0 px-3 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search messages..."
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !composingRef.current && localQuery.trim()) {
                searchMessages(localQuery.trim());
              }
            }}
            className="pl-9 bg-neutral-800 border-none"
          />
        </div>
      </div>

      {/* Conversation list */}
      <ConversationList />

      {/* Bottom buttons */}
      <div className="shrink-0 space-y-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0.75rem))]">
        <Button
          variant="secondary"
          className="w-full gap-2"
          onClick={() => setNewChatOpen(true)}
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
        <Button
          variant="ghost"
          className="w-full gap-2 border border-red-900/60 text-red-200 hover:border-red-800/70 hover:bg-red-950/30"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>

      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} />
      <FriendsDialog open={friendsOpen} onOpenChange={setFriendsOpen} />
    </div>
  );
}
