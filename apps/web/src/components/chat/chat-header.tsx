"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bot, Users } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { BACKEND_URL } from "@/lib/config";
import { cn } from "@/lib/utils";
import type { ConversationType } from "@arinova/shared/types";

interface ChatHeaderProps {
  agentName: string;
  agentDescription: string | null;
  agentAvatarUrl?: string | null;
  isOnline?: boolean;
  type?: ConversationType;
  onClick?: () => void;
}

export function ChatHeader({
  agentName,
  agentDescription,
  agentAvatarUrl,
  isOnline,
  type = "direct",
  onClick,
}: ChatHeaderProps) {
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setActiveConversation(null)}
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 min-w-0 rounded-lg px-2 py-1 -ml-2 transition-colors",
          onClick && "cursor-pointer hover:bg-neutral-800/60"
        )}
      >
        <div className="relative">
          <Avatar className="h-8 w-8">
            {agentAvatarUrl ? (
              <img
                src={`${BACKEND_URL}${agentAvatarUrl}`}
                alt={agentName}
                className="h-full w-full object-cover"
              />
            ) : (
              <AvatarFallback className="bg-neutral-700 text-neutral-200 text-xs">
                {type === "group" ? (
                  <Users className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </AvatarFallback>
            )}
          </Avatar>
          {isOnline !== undefined && (
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background",
                isOnline ? "bg-green-500" : "bg-neutral-500"
              )}
            />
          )}
        </div>
        <div className="min-w-0 text-left">
          <h2 className="text-sm font-semibold truncate">{agentName}</h2>
          {agentDescription && (
            <p className="text-xs text-muted-foreground truncate">
              {agentDescription}
            </p>
          )}
        </div>
      </button>
    </div>
  );
}
