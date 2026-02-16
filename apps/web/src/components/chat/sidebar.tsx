"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Search, Plus, LogOut, Settings, Store, Building2, Bot, Package, Wallet, Code } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { ConversationList } from "./conversation-list";
import { NewChatDialog, CreateBotDialog } from "./new-chat-dialog";

export function Sidebar() {
  const searchQuery = useChatStore((s) => s.searchQuery);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [createBotOpen, setCreateBotOpen] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <h1 className="text-base font-bold">Arinova Chat</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/settings")}
            className="h-8 w-8"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            className="h-8 w-8"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Separator />

      {/* Search */}
      <div className="shrink-0 px-3 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-neutral-800 border-none"
          />
        </div>
      </div>

      {/* Conversation list */}
      <ConversationList />

      {/* Bottom buttons */}
      <div className="shrink-0 space-y-2 p-3">
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
          variant="outline"
          className="w-full gap-2"
          onClick={() => router.push("/marketplace")}
        >
          <Store className="h-4 w-4" />
          Marketplace
        </Button>
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => router.push("/communities")}
        >
          <Building2 className="h-4 w-4" />
          Communities
        </Button>
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => router.push("/apps")}
        >
          <Package className="h-4 w-4" />
          Apps
        </Button>
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => router.push("/wallet")}
        >
          <Wallet className="h-4 w-4" />
          Wallet
        </Button>
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => router.push("/developer")}
        >
          <Code className="h-4 w-4" />
          Developer
        </Button>
      </div>

      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} />
      <CreateBotDialog open={createBotOpen} onOpenChange={setCreateBotOpen} />
    </div>
  );
}
