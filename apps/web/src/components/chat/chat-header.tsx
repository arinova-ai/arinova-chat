"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
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
  MessageSquare,
  BookOpen,
} from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { assetUrl, AGENT_DEFAULT_AVATAR } from "@/lib/config";
import { cn } from "@/lib/utils";
import type { ConversationType } from "@arinova/shared/types";
import { getPushStatus, subscribeToPush } from "@/lib/push";
import { useTranslation } from "@/lib/i18n";

interface ChatHeaderProps {
  agentName: string;
  agentDescription: string | null;
  agentAvatarUrl?: string | null;
  type?: ConversationType;
  conversationId?: string;
  agentId?: string;
  peerUserId?: string | null;
  mentionOnly?: boolean;
  title?: string | null;
  memberCount?: number;
  onClick?: () => void;
  onMembersClick?: () => void;
  onSettingsClick?: () => void;
  onAddMemberClick?: () => void;
  onThreadsClick?: () => void;
  onNotebookClick?: () => void;
}

export function ChatHeader({
  agentName,
  agentDescription,
  agentAvatarUrl,
  type = "direct",
  conversationId,
  agentId,
  peerUserId,
  title,
  memberCount,
  onClick,
  onMembersClick,
  onSettingsClick,
  onAddMemberClick,
  onThreadsClick,
  onNotebookClick,
}: ChatHeaderProps) {
  const { t } = useTranslation();
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const showTimestamps = useChatStore((s) => s.showTimestamps);
  const toggleTimestamps = useChatStore((s) => s.toggleTimestamps);
  const mutedConversations = useChatStore((s) => s.mutedConversations);
  const toggleMuteConversation = useChatStore((s) => s.toggleMuteConversation);
  const isMuted = conversationId ? mutedConversations[conversationId] : false;

  const router = useRouter();

  // For human DMs without an explicit onClick, navigate to the peer's profile
  const effectiveOnClick = onClick ?? (peerUserId ? () => router.push(`/profile/${peerUserId}`) : undefined);

  const handleMuteToggle = useCallback(async () => {
    if (!conversationId) return;
    toggleMuteConversation(conversationId);
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
    <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border px-4">
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
        onClick={effectiveOnClick}
        className={cn(
          "flex items-center gap-3 min-w-0 rounded-lg px-2 py-1 -ml-2 transition-colors",
          effectiveOnClick && "cursor-pointer hover:bg-accent/60"
        )}
      >
        <div className="relative">
          <Avatar className="h-8 w-8">
            <img
              src={agentAvatarUrl ? assetUrl(agentAvatarUrl) : AGENT_DEFAULT_AVATAR}
              alt={displayName}
              className="h-full w-full object-cover"
            />
            <AvatarFallback className="bg-accent text-foreground/80 text-xs">
              {type === "group" ? (
                <Users className="h-4 w-4" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="min-w-0 text-left">
          <h2 className="text-sm font-semibold truncate">{displayName}</h2>
          {type === "group" ? (
            <p className="text-xs text-muted-foreground truncate">
              {memberCount ? `${memberCount} ${t("chat.header.members")}` : t("chat.header.group")}
            </p>
          ) : agentDescription ? (
            <p className="text-xs text-muted-foreground truncate">
              {agentDescription}
            </p>
          ) : null}
        </div>
      </button>

      <div className="ml-auto flex items-center gap-1">
        {type === "group" && conversationId ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", showTimestamps && "text-blue-400")}
              onClick={toggleTimestamps}
              title={showTimestamps ? t("chat.header.hideTimestamps") : t("chat.header.showTimestamps")}
            >
              <Clock className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", isMuted && "text-red-400")}
              onClick={handleMuteToggle}
              title={isMuted ? t("chat.header.unmuteConversation") : t("chat.header.muteConversation")}
            >
              {isMuted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            </Button>
            {onMembersClick && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onMembersClick}
                title={t("chat.header.members")}
              >
                <UsersRound className="h-4 w-4" />
              </Button>
            )}
            {onNotebookClick && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onNotebookClick}
                title={t("chat.notebook.title")}
              >
                <BookOpen className="h-4 w-4" />
              </Button>
            )}
            {onThreadsClick && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onThreadsClick}
                title={t("chat.thread.title")}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title={t("chat.header.moreOptions")}
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onMembersClick && (
                  <DropdownMenuItem onClick={onMembersClick}>
                    <UsersRound className="h-4 w-4" />
                    {t("chat.header.members")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => alert(t("chat.header.photosSoon"))}>
                  <Image className="h-4 w-4" />
                  {t("chat.header.photos")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => alert(t("chat.header.filesSoon"))}>
                  <FileText className="h-4 w-4" />
                  {t("chat.header.files")}
                </DropdownMenuItem>
                {onSettingsClick && (
                  <DropdownMenuItem onClick={onSettingsClick}>
                    <Settings className="h-4 w-4" />
                    {t("chat.header.settings")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", showTimestamps && "text-blue-400")}
              onClick={toggleTimestamps}
              title={showTimestamps ? t("chat.header.hideTimestamps") : t("chat.header.showTimestamps")}
            >
              <Clock className="h-4 w-4" />
            </Button>
            {conversationId && (
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8", isMuted && "text-red-400")}
                onClick={handleMuteToggle}
                title={isMuted ? t("chat.header.unmuteConversation") : t("chat.header.muteConversation")}
              >
                {isMuted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              </Button>
            )}
            {onNotebookClick && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onNotebookClick}
                title={t("chat.notebook.title")}
              >
                <BookOpen className="h-4 w-4" />
              </Button>
            )}
            {onThreadsClick && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onThreadsClick}
                title={t("chat.thread.title")}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
