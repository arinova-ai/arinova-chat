"use client";

import { useCallback } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bot, Users, Clock, Bell, BellOff, Phone, AtSign } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { assetUrl } from "@/lib/config";
import { cn } from "@/lib/utils";
import { subscribeToPush, getPushStatus } from "@/lib/push";
import type { ConversationType } from "@arinova/shared/types";

interface ChatHeaderProps {
  agentName: string;
  agentDescription: string | null;
  agentAvatarUrl?: string | null;
  isOnline?: boolean;
  type?: ConversationType;
  conversationId?: string;
  mentionOnly?: boolean;
  onClick?: () => void;
}

export function ChatHeader({
  agentName,
  agentDescription,
  agentAvatarUrl,
  isOnline,
  type = "direct",
  conversationId,
  mentionOnly,
  onClick,
}: ChatHeaderProps) {
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const showTimestamps = useChatStore((s) => s.showTimestamps);
  const toggleTimestamps = useChatStore((s) => s.toggleTimestamps);
  const mutedConversations = useChatStore((s) => s.mutedConversations);
  const toggleMuteConversation = useChatStore((s) => s.toggleMuteConversation);
  const updateConversation = useChatStore((s) => s.updateConversation);
  const isMuted = conversationId ? mutedConversations[conversationId] : false;

  const handleMentionOnlyToggle = useCallback(() => {
    if (!conversationId) return;
    updateConversation(conversationId, { mentionOnly: !mentionOnly });
  }, [conversationId, mentionOnly, updateConversation]);

  const handleMuteToggle = useCallback(async () => {
    if (!conversationId) return;
    toggleMuteConversation(conversationId);
    // When unmuting, check if push is enabled — if not, prompt to subscribe
    if (isMuted) {
      try {
        const status = await getPushStatus();
        if (status.supported && !status.subscribed && status.permission !== "denied") {
          await subscribeToPush();
        }
      } catch {}
    }
  }, [conversationId, isMuted, toggleMuteConversation]);

  return (
    <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border px-4 pt-[env(safe-area-inset-top,0px)]">
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
                src={assetUrl(agentAvatarUrl)}
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

      <div className="ml-auto flex items-center gap-1">
        {type === "group" && conversationId && (
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", mentionOnly ? "text-blue-400" : "text-neutral-500")}
            onClick={handleMentionOnlyToggle}
            title={mentionOnly ? "Mention-only ON: only @mentioned agents respond" : "Mention-only OFF: all agents respond"}
          >
            <AtSign className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", showTimestamps && "text-blue-400")}
          onClick={toggleTimestamps}
          title={showTimestamps ? "Hide timestamps" : "Show timestamps"}
        >
          <Clock className="h-4 w-4" />
        </Button>
        {conversationId && (
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", isMuted && "text-red-400")}
            onClick={handleMuteToggle}
            title={isMuted ? "Unmute conversation" : "Mute conversation"}
          >
            {isMuted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground opacity-50 cursor-not-allowed"
          disabled
          title="Voice call (Coming Soon)"
        >
          <Phone className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
