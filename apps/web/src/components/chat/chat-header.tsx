"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bot, Menu, Users } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import type { ConversationType } from "@arinova/shared/types";

interface ChatHeaderProps {
  agentName: string;
  agentDescription: string | null;
  type?: ConversationType;
}

export function ChatHeader({
  agentName,
  agentDescription,
  type = "direct",
}: ChatHeaderProps) {
  const setSidebarOpen = useChatStore((s) => s.setSidebarOpen);

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setSidebarOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>
      <Avatar className="h-8 w-8">
        <AvatarFallback className="bg-neutral-700 text-neutral-200 text-xs">
          {type === "group" ? (
            <Users className="h-4 w-4" />
          ) : (
            <Bot className="h-4 w-4" />
          )}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold truncate">{agentName}</h2>
        {agentDescription && (
          <p className="text-xs text-muted-foreground truncate">
            {agentDescription}
          </p>
        )}
      </div>
    </div>
  );
}
