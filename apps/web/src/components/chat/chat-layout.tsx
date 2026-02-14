"use client";

import { useEffect } from "react";
import { Sidebar } from "./sidebar";
import { ChatArea } from "./chat-area";
import { useChatStore } from "@/store/chat-store";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export function ChatLayout() {
  const sidebarOpen = useChatStore((s) => s.sidebarOpen);
  const setSidebarOpen = useChatStore((s) => s.setSidebarOpen);
  const loadAgents = useChatStore((s) => s.loadAgents);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const initWS = useChatStore((s) => s.initWS);

  useEffect(() => {
    loadAgents();
    loadConversations();
    const cleanup = initWS();
    return cleanup;
  }, [loadAgents, loadConversations, initWS]);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden w-80 shrink-0 border-r border-border md:block">
        <Sidebar />
      </div>

      {/* Mobile sidebar (Sheet) */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-80 p-0">
          <Sidebar />
        </SheetContent>
      </Sheet>

      {/* Chat area */}
      <div className="flex-1">
        <ChatArea />
      </div>
    </div>
  );
}
