"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  Search,
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
  onPhotosClick?: () => void;
  onFilesClick?: () => void;
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
  onPhotosClick,
  onFilesClick,
}: ChatHeaderProps) {
  const { t } = useTranslation();
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const mutedConversations = useChatStore((s) => s.mutedConversations);
  const toggleMuteConversation = useChatStore((s) => s.toggleMuteConversation);
  const isMuted = conversationId ? mutedConversations[conversationId] : false;
  const convSearchOpen = useChatStore((s) => s.convSearchOpen);
  const openConvSearch = useChatStore((s) => s.openConvSearch);
  const closeConvSearch = useChatStore((s) => s.closeConvSearch);
  const searchConversation = useChatStore((s) => s.searchConversation);
  const convSearchResults = useChatStore((s) => s.convSearchResults);
  const convSearchIndex = useChatStore((s) => s.convSearchIndex);
  const convSearchLoading = useChatStore((s) => s.convSearchLoading);
  const setConvSearchIndex = useChatStore((s) => s.setConvSearchIndex);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [localSearchQuery, setLocalSearchQuery] = useState("");

  useEffect(() => {
    if (convSearchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setLocalSearchQuery("");
    }
  }, [convSearchOpen]);

  const handleSearchSubmit = useCallback(() => {
    if (localSearchQuery.trim()) {
      searchConversation(localSearchQuery.trim());
    }
  }, [localSearchQuery, searchConversation]);

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
    <div className="shrink-0 border-b border-border">
    <div className="flex min-h-14 items-center gap-3 px-4">
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
              className={cn("h-8 w-8", convSearchOpen && "text-blue-400")}
              onClick={convSearchOpen ? closeConvSearch : openConvSearch}
              title={t("chat.search.inConversation")}
            >
              <Search className="h-4 w-4" />
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
                <DropdownMenuItem onClick={onPhotosClick}>
                  <Image className="h-4 w-4" />
                  {t("chat.header.photos")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onFilesClick}>
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
              className={cn("h-8 w-8", convSearchOpen && "text-blue-400")}
              onClick={convSearchOpen ? closeConvSearch : openConvSearch}
              title={t("chat.search.inConversation")}
            >
              <Search className="h-4 w-4" />
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

    {/* Conversation search bar */}
    {convSearchOpen && (
      <div className="flex items-center gap-2 border-t border-border/50 px-4 py-2">
        <input
          ref={searchInputRef}
          type="text"
          value={localSearchQuery}
          onChange={(e) => setLocalSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) {
                // Shift+Enter: go to previous result
                if (convSearchIndex > 0) setConvSearchIndex(convSearchIndex - 1);
              } else {
                if (convSearchResults.length > 0 && localSearchQuery.trim() === useChatStore.getState().convSearchQuery) {
                  // Already searched, go to next result
                  setConvSearchIndex((convSearchIndex + 1) % convSearchResults.length);
                } else {
                  handleSearchSubmit();
                }
              }
            } else if (e.key === "Escape") {
              closeConvSearch();
            }
          }}
          placeholder={t("chat.search.inConversation")}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        {convSearchLoading ? (
          <span className="text-xs text-muted-foreground animate-pulse">...</span>
        ) : convSearchResults.length > 0 ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("chat.search.nOfTotal")
              .replace("{n}", String(convSearchIndex + 1))
              .replace("{total}", String(convSearchResults.length))}
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          disabled={convSearchResults.length === 0 || convSearchIndex <= 0}
          onClick={() => setConvSearchIndex(convSearchIndex - 1)}
          title="Previous"
        >
          <ArrowLeft className="h-3.5 w-3.5 rotate-90" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          disabled={convSearchResults.length === 0 || convSearchIndex >= convSearchResults.length - 1}
          onClick={() => setConvSearchIndex(convSearchIndex + 1)}
          title="Next"
        >
          <ArrowLeft className="h-3.5 w-3.5 -rotate-90" />
        </Button>
      </div>
    )}
    </div>
  );
}
