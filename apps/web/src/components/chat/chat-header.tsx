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
  Settings,
  Search,
  Headset,
  ArrowRightLeft,
  Brain,
  Phone,
} from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { useVoiceCallStore } from "@/store/voice-call-store";
import { useHeaderPinStore } from "@/store/header-pin-store";
import { useGroupPinStore } from "@/store/group-pin-store";
import { HEADER_BUTTONS, GROUP_HEADER_BUTTONS, GROUP_MAX_PINS, ChatHeaderSettings } from "./chat-header-settings";
import { assetUrl, AGENT_DEFAULT_AVATAR } from "@/lib/config";
import { cn, isGroupLike } from "@/lib/utils";
import type { ConversationType } from "@arinova/shared/types";
import { getPushStatus, subscribeToPush } from "@/lib/push";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";
import { MemoryCapsuleSheet } from "./memory-capsule-sheet";
import { CommunitySettingsSheet } from "./community-settings";
import { useRightPanelStore } from "@/store/right-panel-store";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Pin } from "lucide-react";

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
  onThreadsClick?: () => void;
  onKanbanClick?: () => void;
  onNotebookClick?: () => void;
  onWikiClick?: () => void;
  onPhotosClick?: () => void;
  onFilesClick?: () => void;
  officialCommunityId?: string | null;
}

export function ChatHeader({
  agentName,
  agentDescription,
  agentAvatarUrl,
  type = "h2a",
  conversationId,
  agentId,
  peerUserId,
  title,
  memberCount,
  onClick,
  onMembersClick,
  onSettingsClick,
  onThreadsClick,
  onKanbanClick,
  onNotebookClick,
  onWikiClick,
  onPhotosClick,
  onFilesClick,
  officialCommunityId,
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

  // Memory Capsule sheet
  const [memoryCapsuleOpen, setMemoryCapsuleOpen] = useState(false);
  // Community settings sheet
  const [communitySettingsOpen, setCommunitySettingsOpen] = useState(false);
  const [communitySettingsTab, setCommunitySettingsTab] = useState<"info" | "members" | undefined>(undefined);
  // Header pin settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pinnedIds = useHeaderPinStore((s) => s.pinnedIds);

  // Group per-conversation pinned buttons
  const groupPins = useGroupPinStore((s) => conversationId ? s.getPins(conversationId) : []);
  const loadGroupPins = useGroupPinStore((s) => s.loadPins);
  useEffect(() => {
    if (type === "group" && conversationId) {
      loadGroupPins(conversationId);
    }
  }, [type, conversationId, loadGroupPins]);

  // Voice call
  const startCall = useVoiceCallStore((s) => s.startCall);
  const callState = useVoiceCallStore((s) => s.callState);
  const isInCall = callState !== "idle";
  const canCall = (type === "h2h" || type === "direct") && conversationId && peerUserId;

  const handleStartCall = useCallback(() => {
    if (!conversationId || isInCall) return;
    if (peerUserId) {
      startCall(conversationId, { targetUserId: peerUserId }, agentName, agentAvatarUrl ?? null, "native");
    } else if (agentId) {
      startCall(conversationId, { agentId }, agentName, agentAvatarUrl ?? null, "native");
    }
  }, [conversationId, peerUserId, agentId, agentName, agentAvatarUrl, isInCall, startCall]);

  // Pending applications badge (community only)
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    if (type !== "community" || !officialCommunityId) return;
    let cancelled = false;
    (async () => {
      try {
        const detail = await api<{ requireApproval?: boolean; myRole?: string }>(
          `/api/communities/${officialCommunityId}`,
          { silent: true },
        );
        if (cancelled) return;
        const canManage = detail.myRole === "creator" || detail.myRole === "moderator";
        if (!detail.requireApproval || !canManage) return;
        const res = await api<{ applications: { status: string }[] }>(
          `/api/communities/${officialCommunityId}/applications`,
          { silent: true },
        );
        if (cancelled) return;
        const pending = (res.applications ?? []).filter((a) => a.status === "pending");
        setPendingCount(pending.length);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [type, officialCommunityId]);

  // Official CS status
  const [csStatus, setCsStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!officialCommunityId || !conversationId) return;
    api<{ status: string }>(`/api/communities/${officialCommunityId}/cs-status?conversationId=${conversationId}`, { silent: true })
      .then((d) => setCsStatus(d.status))
      .catch(() => {});
  }, [officialCommunityId, conversationId]);

  const handleTransferHuman = useCallback(async () => {
    if (!officialCommunityId || !conversationId) return;
    try {
      await api(`/api/communities/${officialCommunityId}/transfer-human`, {
        method: "POST",
        body: JSON.stringify({ conversationId }),
      });
      setCsStatus("waiting_human");
    } catch {}
  }, [officialCommunityId, conversationId]);

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

  const displayName = (type === "group" || type === "community") && title ? title : agentName;

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
              {isGroupLike(type) ? (
                <Users className="h-4 w-4" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="min-w-0 text-left">
          <h2 className="text-sm font-semibold truncate">{displayName}</h2>
          {officialCommunityId && csStatus ? (
            <p className="flex items-center gap-1 text-xs truncate">
              <Headset className="h-3 w-3" />
              <span className={cn(
                csStatus === "ai_active" && "text-blue-400",
                csStatus === "human_active" && "text-green-400",
                csStatus === "waiting_human" && "text-yellow-400",
                csStatus === "resolved" && "text-muted-foreground",
              )}>
                {t(`community.cs.status.${csStatus}`)}
              </span>
            </p>
          ) : type === "group" || type === "community" ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground truncate">
              <span>{memberCount ? `${memberCount} ${t("chat.header.members")}` : t("chat.header.group")}</span>
              {pendingCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none">
                  {pendingCount}
                </span>
              )}
            </p>
          ) : agentDescription ? (
            <p className="text-xs text-muted-foreground truncate">
              {agentDescription}
            </p>
          ) : null}
        </div>
      </button>

      <div className="ml-auto flex items-center gap-1">
        {officialCommunityId && (type === "community" || type === "official" || type === "lounge") && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title={t("communitySettings.title")}
            onClick={() => { setCommunitySettingsTab(undefined); setCommunitySettingsOpen(true); }}
          >
            <Settings className="h-4 w-4" />
          </Button>
        )}
        {(type === "group" || type === "community") && conversationId ? (
          <GroupHeaderButtons
            conversationId={conversationId}
            groupPins={groupPins}
            convSearchOpen={convSearchOpen}
            isMuted={isMuted}
            isCommunity={type === "community"}
            onAction={(actionId) => {
              switch (actionId) {
                case "search": convSearchOpen ? closeConvSearch() : openConvSearch(); break;
                case "mute": handleMuteToggle(); break;
                case "members":
                  if (type === "community" && officialCommunityId) {
                    setCommunitySettingsTab("members");
                    setCommunitySettingsOpen(true);
                  } else {
                    onMembersClick?.();
                  }
                  break;
                case "wiki": onWikiClick?.(); break;
                case "kanban": onKanbanClick?.(); break;
                case "notebook": onNotebookClick?.(); break;
                case "threads": onThreadsClick?.(); break;
                case "photos": onPhotosClick?.(); break;
                case "files": onFilesClick?.(); break;
              }
            }}
            onSettingsOpen={() => {
              if (type === "community" && officialCommunityId) {
                setCommunitySettingsTab(undefined);
                setCommunitySettingsOpen(true);
              } else {
                setSettingsOpen(true);
              }
            }}
            t={t}
          />
        ) : (
          <DirectHeaderButtons
            type={type}
            pinnedIds={pinnedIds}
            convSearchOpen={convSearchOpen}
            isMuted={isMuted}
            isInCall={isInCall}
            canCall={!!canCall}
            conversationId={conversationId}
            agentId={agentId}
            officialCommunityId={officialCommunityId}
            csStatus={csStatus}
            onAction={(actionId) => {
              switch (actionId) {
                case "search": convSearchOpen ? closeConvSearch() : openConvSearch(); break;
                case "mute": handleMuteToggle(); break;
                case "kanban": onKanbanClick?.(); break;
                case "notebook": onNotebookClick?.(); break;
                case "threads": onThreadsClick?.(); break;
                case "call": handleStartCall(); break;
                case "photos": onPhotosClick?.(); break;
                case "files": onFilesClick?.(); break;
                case "capsule":
                  if (window.matchMedia("(min-width: 1280px)").matches) {
                    useRightPanelStore.getState().setActiveTab("memory");
                  } else {
                    setMemoryCapsuleOpen(true);
                  }
                  break;
              }
            }}
            onTransferHuman={handleTransferHuman}
            onSettingsOpen={() => {
              if (type === "community" || type === "official" || type === "lounge") {
                setCommunitySettingsTab(undefined);
                setCommunitySettingsOpen(true);
              } else {
                setSettingsOpen(true);
              }
            }}
            t={t}
          />
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

    {agentId && conversationId && (type === "h2a" || type === "direct") && (
      <MemoryCapsuleSheet
        open={memoryCapsuleOpen}
        onOpenChange={setMemoryCapsuleOpen}
        conversationId={conversationId}
        conversationName={agentName}
        agentId={agentId}
      />
    )}
    <ChatHeaderSettings
      open={settingsOpen}
      onOpenChange={setSettingsOpen}
      conversationId={conversationId}
      mode={isGroupLike(type) ? "group" : "direct"}
      groupTitle={title ?? undefined}
      groupAvatarUrl={agentAvatarUrl}
      onGroupTitleSave={isGroupLike(type) ? (newTitle) => {
        if (conversationId) {
          useChatStore.getState().updateGroupSettings(conversationId, { title: newTitle });
        }
      } : undefined}
    />
    {officialCommunityId && conversationId && (
      <CommunitySettingsSheet
        open={communitySettingsOpen}
        onClose={() => setCommunitySettingsOpen(false)}
        communityId={officialCommunityId}
        conversationId={conversationId}
        initialTab={communitySettingsTab}
      />
    )}
    </div>
  );
}

/* ─── H2H / H2A pinned buttons + hamburger ─── */

interface DirectHeaderButtonsProps {
  type: ConversationType;
  pinnedIds: string[];
  convSearchOpen: boolean;
  isMuted: boolean;
  isInCall: boolean;
  canCall: boolean;
  conversationId?: string;
  agentId?: string;
  officialCommunityId?: string | null;
  csStatus: string | null;
  onAction: (id: string) => void;
  onTransferHuman: () => void;
  onSettingsOpen: () => void;
  t: (key: string) => string;
}

function DirectHeaderButtons({
  type,
  pinnedIds,
  convSearchOpen,
  isMuted,
  isInCall,
  canCall,
  conversationId,
  agentId,
  officialCommunityId,
  csStatus,
  onAction,
  onTransferHuman,
  onSettingsOpen,
  t,
}: DirectHeaderButtonsProps) {
  const convType = type === "direct" ? "h2a" : type;

  // Filter buttons for this conversation type
  const available = HEADER_BUTTONS.filter((btn) => {
    if (!btn.supportedTypes.includes(convType as "h2h" | "h2a")) return false;
    if (btn.id === "call" && !canCall) return false;
    if (btn.id === "capsule" && !(agentId && conversationId)) return false;
    return true;
  });

  const pinned = available.filter((btn) => pinnedIds.includes(btn.id));

  const getActiveState = (id: string): boolean => {
    if (id === "search") return convSearchOpen;
    if (id === "mute") return isMuted;
    if (id === "call") return isInCall;
    return false;
  };

  const getActiveColor = (id: string): string => {
    if (id === "search" && convSearchOpen) return "text-blue-400";
    if (id === "mute" && isMuted) return "text-red-400";
    if (id === "call" && isInCall) return "text-green-400";
    return "";
  };

  const getMuteIcon = () => isMuted ? BellOff : Bell;

  return (
    <>
      {officialCommunityId && csStatus === "ai_active" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs text-yellow-500 hover:text-yellow-400"
          onClick={onTransferHuman}
          title={t("community.cs.transferHuman")}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t("community.cs.transferHuman")}</span>
        </Button>
      )}

      {/* Pinned buttons */}
      {pinned.map((btn) => {
        const Icon = btn.id === "mute" ? getMuteIcon() : btn.icon;
        const activeColor = getActiveColor(btn.id);
        return (
          <Button
            key={btn.id}
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", activeColor)}
            onClick={() => onAction(btn.id)}
            disabled={btn.id === "call" && isInCall}
            title={t(btn.labelKey)}
          >
            <Icon className="h-4 w-4" />
          </Button>
        );
      })}

      {/* Hamburger menu */}
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
          {available.map((btn) => {
            const Icon = btn.id === "mute" ? getMuteIcon() : btn.icon;
            const isPinned = pinnedIds.includes(btn.id);
            return (
              <DropdownMenuItem
                key={btn.id}
                onClick={() => onAction(btn.id)}
                disabled={btn.id === "call" && isInCall}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{t(btn.labelKey)}</span>
                {isPinned && <Pin className="ml-2 h-3 w-3 text-muted-foreground" />}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onSettingsOpen}>
            <Settings className="h-4 w-4" />
            {t("chat.header.settings")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/* ─── Group pinned buttons + hamburger ─── */

interface GroupHeaderButtonsProps {
  conversationId: string;
  groupPins: string[];
  convSearchOpen: boolean;
  isMuted: boolean;
  isCommunity?: boolean;
  onAction: (id: string) => void;
  onSettingsOpen: () => void;
  t: (key: string) => string;
}

const COMMUNITY_FIXED_BUTTONS = ["search", "members", "mute", "wiki", "threads"];

function GroupHeaderButtons({
  conversationId,
  groupPins,
  convSearchOpen,
  isMuted,
  isCommunity,
  onAction,
  onSettingsOpen,
  t,
}: GroupHeaderButtonsProps) {
  const togglePin = useGroupPinStore((s) => s.togglePin);
  const pinned = isCommunity
    ? GROUP_HEADER_BUTTONS.filter((btn) => COMMUNITY_FIXED_BUTTONS.includes(btn.id))
    : GROUP_HEADER_BUTTONS.filter((btn) => groupPins.includes(btn.id));

  const getActiveColor = (id: string): string => {
    if (id === "search" && convSearchOpen) return "text-blue-400";
    if (id === "mute" && isMuted) return "text-red-400";
    return "";
  };

  const getMuteIcon = () => (isMuted ? BellOff : Bell);

  return (
    <>
      {pinned.map((btn) => {
        const Icon = btn.id === "mute" ? getMuteIcon() : btn.icon;
        const activeColor = getActiveColor(btn.id);
        return (
          <Button
            key={btn.id}
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", activeColor)}
            onClick={() => onAction(btn.id)}
            title={t(btn.labelKey)}
          >
            <Icon className="h-4 w-4" />
          </Button>
        );
      })}

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
          {GROUP_HEADER_BUTTONS.map((btn) => {
            const Icon = btn.id === "mute" ? getMuteIcon() : btn.icon;
            const isPinned = !isCommunity && groupPins.includes(btn.id);
            return (
              <DropdownMenuItem
                key={btn.id}
                onClick={() => onAction(btn.id)}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{t(btn.labelKey)}</span>
                {isPinned && <Pin className="ml-2 h-3 w-3 text-muted-foreground" />}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onSettingsOpen}>
            <Settings className="h-4 w-4" />
            {t("chat.header.settings")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

