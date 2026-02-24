"use client";

import { useCallback } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Bot,
  Users,
  Clock,
  Bell,
  BellOff,
  Menu,
  UserPlus,
  UsersRound,
  Image,
  FileText,
  Settings,
} from "lucide-react";
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
  title?: string | null;
  onClick?: () => void;
  onMembersClick?: () => void;
  onSettingsClick?: () => void;
  onAddMemberClick?: () => void;
}

export function ChatHeader({
  agentName,
  agentDescription,
  agentAvatarUrl,
  isOnline,
  type = "direct",
  conversationId,
  title,
  onClick,
  onMembersClick,
  onSettingsClick,
  onAddMemberClick,
}: ChatHeaderProps) {
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const showTimestamps = useChatStore((s) => s.showTimestamps);
  const toggleTimestamps = useChatStore((s) => s.toggleTimestamps);
  const mutedConversations = useChatStore((s) => s.mutedConversations);
  const toggleMuteConversation = useChatStore((s) => s.toggleMuteConversation);
  const isMuted = conversationId ? mutedConversations[conversationId] : false;

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

  const displayName = type === "group" && title ? title : agentName;

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
                alt={displayName}
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
          <h2 className="text-sm font-semibold truncate">{displayName}</h2>
          {agentDescription && (
            <p className="text-xs text-muted-foreground truncate">
              {agentDescription}
            </p>
          )}
        </div>
      </button>

      <div className="ml-auto flex items-center gap-1">
        {type === "group" && conversationId ? (
          <>
            {/* Add Member */}
            {onAddMemberClick && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onAddMemberClick}
                title="Add member"
              >
                <UserPlus className="h-4 w-4" />
              </Button>
            )}

            {/* Mute toggle */}
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", isMuted && "text-red-400")}
              onClick={handleMuteToggle}
              title={isMuted ? "Unmute conversation" : "Mute conversation"}
            >
              {isMuted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            </Button>

            {/* Hamburger menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="More options"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onMembersClick && (
                  <DropdownMenuItem onClick={onMembersClick}>
                    <UsersRound className="h-4 w-4" />
                    Members
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => alert("Photos coming soon")}>
                  <Image className="h-4 w-4" />
                  Photos
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => alert("Files coming soon")}>
                  <FileText className="h-4 w-4" />
                  Files
                </DropdownMenuItem>
                {onSettingsClick && (
                  <DropdownMenuItem onClick={onSettingsClick}>
                    <Settings className="h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <>
            {/* Direct conversation buttons */}
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
          </>
        )}
      </div>
    </div>
  );
}
