"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Search, Plus, LogOut, Settings, Bot } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { ConversationList } from "./conversation-list";
import { NewChatDialog, CreateBotDialog } from "./new-chat-dialog";

export function Sidebar() {
  const searchMessages = useChatStore((s) => s.searchMessages);
  const storeSearchQuery = useChatStore((s) => s.searchQuery);
  const [localQuery, setLocalQuery] = useState("");
  const composingRef = useRef(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [createBotOpen, setCreateBotOpen] = useState(false);
  const router = useRouter();

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
          variant="secondary"
          className="w-full gap-2"
          onClick={() => setCreateBotOpen(true)}
        >
          <Bot className="h-4 w-4" />
          Create Bot
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
      <CreateBotDialog open={createBotOpen} onOpenChange={setCreateBotOpen} />
    </div>
  );
}
