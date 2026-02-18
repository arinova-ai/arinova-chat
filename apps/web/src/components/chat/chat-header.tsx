"use client";

import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bot, Users, Clock, Bell, BellOff, Phone } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { useVoiceCallStore } from "@/store/voice-call-store";
import { assetUrl } from "@/lib/config";
import { cn } from "@/lib/utils";
import { MicPermissionDialog } from "@/components/voice/mic-permission";
import type { ConversationType } from "@arinova/shared/types";
import type { VoiceMode } from "@/lib/voice-types";

interface ChatHeaderProps {
  agentName: string;
  agentDescription: string | null;
  agentAvatarUrl?: string | null;
  isOnline?: boolean;
  type?: ConversationType;
  conversationId?: string;
  agentId?: string;
  voiceCapable?: boolean;
  onClick?: () => void;
}

export function ChatHeader({
  agentName,
  agentDescription,
  agentAvatarUrl,
  isOnline,
  type = "direct",
  conversationId,
  agentId,
  voiceCapable,
  onClick,
}: ChatHeaderProps) {
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const showTimestamps = useChatStore((s) => s.showTimestamps);
  const toggleTimestamps = useChatStore((s) => s.toggleTimestamps);
  const mutedConversations = useChatStore((s) => s.mutedConversations);
  const toggleMuteConversation = useChatStore((s) => s.toggleMuteConversation);
  const isMuted = conversationId ? mutedConversations[conversationId] : false;

  const callState = useVoiceCallStore((s) => s.callState);
  const startCall = useVoiceCallStore((s) => s.startCall);

  const [micDialogOpen, setMicDialogOpen] = useState(false);

  const canCall = voiceCapable && conversationId && agentId && type === "direct" && callState === "idle";

  const handleStartCall = () => {
    if (!conversationId || !agentId) return;

    // Determine voice mode — for now default to full_fallback
    // Backend will provide capability detection; use full_fallback as safe default
    const voiceMode: VoiceMode = "full_fallback";

    setMicDialogOpen(false);
    startCall(conversationId, agentId, agentName, agentAvatarUrl ?? null, voiceMode);
  };

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
            onClick={() => toggleMuteConversation(conversationId)}
            title={isMuted ? "Unmute conversation" : "Mute conversation"}
          >
            {isMuted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          </Button>
        )}
        {canCall ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-green-400 hover:text-green-300"
            onClick={() => setMicDialogOpen(true)}
            title="語音通話"
          >
            <Phone className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground opacity-50 cursor-not-allowed"
            disabled
            title={callState !== "idle" ? "通話中" : "語音通話不可用"}
          >
            <Phone className="h-4 w-4" />
          </Button>
        )}
      </div>

      <MicPermissionDialog
        open={micDialogOpen}
        onOpenChange={setMicDialogOpen}
        onAllow={handleStartCall}
      />
    </div>
  );
}
