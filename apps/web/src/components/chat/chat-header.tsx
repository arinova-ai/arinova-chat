"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-is-mobile";
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
  X,
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
import { Pin, CalendarSearch, Activity } from "lucide-react";
import { wsManager } from "@/lib/ws";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { Message } from "@arinova/shared/types";

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
  const [communitySettingsTab, setCommunitySettingsTab] = useState<"info" | undefined>(undefined);
  const [resolvedCommunityId, setResolvedCommunityId] = useState<string | null>(null);
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
    setPendingCount(0);
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
        if (!detail.requireApproval || !canManage) {
          setPendingCount(0);
          return;
        }
        const res = await api<{ applications: { status: string }[] }>(
          `/api/communities/${officialCommunityId}/applications`,
          { silent: true },
        );
        if (cancelled) return;
        const pending = (res.applications ?? []).filter((a) => a.status === "pending");
        setPendingCount(pending.length);
      } catch {
        setPendingCount(0);
      }
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
  // For communities, navigate to community profile page
  const effectiveOnClick = onClick ?? (
    type === "community" && conversationId
      ? async () => {
          try {
            const data = await api<{ id: string }>(`/api/communities/by-conversation/${conversationId}`);
            router.push(`/community/${data.id}`);
          } catch { /* ignore */ }
        }
      : peerUserId ? () => router.push(`/profile/${peerUserId}`) : undefined
  );

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

  const displayName = (type === "group" || type === "community" || type === "lounge" || type === "official") && title ? title : agentName;

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
              {pendingCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none">
                  {pendingCount}
                </span>
              )}
            </p>
          ) : type === "group" || type === "community" ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground truncate">
              <span>{memberCount ? `${memberCount} ${t("chat.header.members")}` : t("chat.header.group")}</span>
              {type === "community" && pendingCount > 0 && (
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
        {(type === "group" || type === "community") && conversationId ? (
          <GroupHeaderButtons
            conversationId={conversationId}
            groupPins={groupPins}
            convSearchOpen={convSearchOpen}
            isMuted={isMuted}
            isCommunity={type === "community"}
            pendingCount={pendingCount}
            onAction={(actionId) => {
              switch (actionId) {
                case "search": convSearchOpen ? closeConvSearch() : openConvSearch(); break;
                case "mute": handleMuteToggle(); break;
                case "members":
                  onMembersClick?.();
                  break;
                case "wiki": onWikiClick?.(); break;
                case "kanban": onKanbanClick?.(); break;
                case "notebook": onNotebookClick?.(); break;
                case "threads": onThreadsClick?.(); break;
                case "photos": onPhotosClick?.(); break;
                case "files": onFilesClick?.(); break;
              }
            }}
            onSettingsOpen={async () => {
              if (type === "community") {
                if (!officialCommunityId) {
                  // Fetch community ID from conversation
                  try {
                    const data = await api<{ id: string }>(`/api/communities/by-conversation/${conversationId}`);
                    if (data.id) {
                      setResolvedCommunityId(data.id);
                      setCommunitySettingsTab(undefined);
                      setCommunitySettingsOpen(true);
                      return;
                    }
                  } catch { /* fall through */ }
                } else {
                  setCommunitySettingsTab(undefined);
                  setCommunitySettingsOpen(true);
                  return;
                }
              }
              if (window.matchMedia("(min-width: 1280px)").matches) {
                useRightPanelStore.getState().setActiveTab("settings");
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
              } else if (window.matchMedia("(min-width: 1280px)").matches) {
                useRightPanelStore.getState().setActiveTab("settings");
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
        <div className="relative min-w-0 flex-1 flex items-center">
          <input
            ref={searchInputRef}
            type="text"
            value={localSearchQuery}
            onChange={(e) => setLocalSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) {
                  if (convSearchIndex > 0) setConvSearchIndex(convSearchIndex - 1);
                } else {
                  if (convSearchResults.length > 0 && localSearchQuery.trim() === useChatStore.getState().convSearchQuery) {
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
            className="min-w-0 w-full rounded-md border border-border bg-background pl-3 pr-16 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="absolute right-1 flex items-center gap-0.5">
            {localSearchQuery && (
              <button
                type="button"
                className="h-6 w-6 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => { setLocalSearchQuery(""); searchInputRef.current?.focus(); }}
                title="Clear"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {conversationId && <DateJumpButton conversationId={conversationId} />}
          </div>
        </div>
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
    {(officialCommunityId || resolvedCommunityId) && conversationId && (
      <CommunitySettingsSheet
        open={communitySettingsOpen}
        onClose={() => setCommunitySettingsOpen(false)}
        communityId={(officialCommunityId ?? resolvedCommunityId) as string}
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

/* ─── Date Jump Button ─── */

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function DateJumpButton({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set());
  const [loadingDates, setLoadingDates] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(new Date());
  const tzOffset = new Date().getTimezoneOffset(); // e.g. -480 for UTC+8

  const fetchActiveDates = useCallback(async (month: Date) => {
    setLoadingDates(true);
    try {
      const data = await api<{ dates: string[] }>(
        `/api/conversations/${conversationId}/messages/dates?month=${fmtMonth(month)}&tz=${tzOffset}`,
        { silent: true },
      );
      setActiveDates(new Set(data.dates));
    } catch {
      setActiveDates(new Set());
    } finally {
      setLoadingDates(false);
    }
  }, [conversationId]);

  // Fetch active dates when popover opens or month changes
  useEffect(() => {
    if (open) fetchActiveDates(displayMonth);
  }, [open, displayMonth, fetchActiveDates]);

  const handleDateSelect = useCallback(async (day: Date | undefined) => {
    if (!day || !conversationId) return;
    const dateStr = fmtDate(day);
    setLoading(true);
    try {
      const data = await api<{ messageId: string }>(
        `/api/conversations/${conversationId}/messages/by-date?date=${dateStr}&tz=${tzOffset}`,
      );
      const state = useChatStore.getState();
      const currentMsgs = state.messagesByConversation[conversationId] ?? [];
      const found = currentMsgs.some((m) => m.id === data.messageId);
      if (!found) {
        const around = await api<{
          messages: Message[];
          hasMoreUp: boolean;
          hasMoreDown: boolean;
        }>(`/api/conversations/${conversationId}/messages?around=${data.messageId}&limit=50`);
        useChatStore.setState({
          highlightMessageId: data.messageId,
          jumpPagination: { hasMoreUp: around.hasMoreUp, hasMoreDown: around.hasMoreDown },
          messagesByConversation: {
            ...useChatStore.getState().messagesByConversation,
            [conversationId]: around.messages,
          },
        });
      } else {
        useChatStore.setState({ highlightMessageId: data.messageId });
      }
      setTimeout(() => {
        if (useChatStore.getState().highlightMessageId === data.messageId) {
          useChatStore.setState({ highlightMessageId: null });
        }
      }, 1000);
      setOpen(false);
    } catch {
      // No messages on that date — silently ignore
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6" title="Jump to date">
          <CalendarSearch className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          fromYear={2024}
          toYear={new Date().getFullYear()}
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          onSelect={handleDateSelect}
          disabled={(date) =>
            date > new Date() || loading || loadingDates || !activeDates.has(fmtDate(date))
          }
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

/** Hamburger menu: Sheet on mobile, DropdownMenu on desktop */
function HamburgerMenu({
  items,
  onAction,
  onSettingsOpen,
  pinnedIds,
  getMuteIcon,
  isInCall,
  showHudToggle,
  conversationId: menuConvId,
  t,
}: {
  items: { id: string; icon: React.ComponentType<{ className?: string }>; labelKey: string }[];
  onAction: (id: string) => void;
  onSettingsOpen: () => void;
  pinnedIds: string[];
  getMuteIcon?: () => React.ComponentType<{ className?: string }>;
  isInCall?: boolean;
  showHudToggle?: boolean;
  conversationId?: string;
  t: (key: string) => string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    const overlay = open ? createPortal(
      <div className="fixed inset-0 z-50 flex">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
        {/* Panel slides from right */}
        <div
          className="absolute inset-0 h-full w-full bg-background flex flex-col animate-in slide-in-from-right duration-200"
          style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {/* Close button */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold">{t("chat.header.moreOptions")}</span>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-muted">
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Menu items */}
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            {items.map((btn) => {
              const Icon = btn.id === "mute" && getMuteIcon ? getMuteIcon() : btn.icon;
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => { setOpen(false); onAction(btn.id); }}
                  disabled={btn.id === "call" && isInCall}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-foreground hover:bg-muted/50 active:bg-muted transition-colors disabled:opacity-40"
                >
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <span className="flex-1 text-left">{t(btn.labelKey)}</span>
                  {pinnedIds.includes(btn.id) && <Pin className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              );
            })}
            {showHudToggle && (
              <button
                type="button"
                onClick={() => {
                  import("@/store/hud-store").then(({ useHudStore }) => {
                    const s = useHudStore.getState();
                    s.toggle();
                    if (useHudStore.getState().enabled && menuConvId) {
                      setTimeout(() => wsManager.send({ type: "send_message", conversationId: menuConvId, content: "/hud" }), 300);
                    }
                  });
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-foreground hover:bg-muted/50 active:bg-muted transition-colors"
              >
                <Activity className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1 text-left">HUD</span>
              </button>
            )}
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              onClick={() => { setOpen(false); onSettingsOpen(); }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-foreground hover:bg-muted/50 active:bg-muted transition-colors"
            >
              <Settings className="h-5 w-5 text-muted-foreground" />
              <span>{t("chat.header.settings")}</span>
            </button>
          </div>
        </div>
      </div>,
      document.body,
    ) : null;

    return (
      <>
        <Button variant="ghost" size="icon" className="h-9 w-9" title={t("chat.header.moreOptions")} onClick={() => setOpen(true)}>
          <Menu className="h-4 w-4" />
        </Button>
        {overlay}
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title={t("chat.header.moreOptions")}>
          <Menu className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((btn) => {
          const Icon = btn.id === "mute" && getMuteIcon ? getMuteIcon() : btn.icon;
          return (
            <DropdownMenuItem key={btn.id} onClick={() => onAction(btn.id)} disabled={btn.id === "call" && isInCall}>
              <Icon className="h-4 w-4" />
              <span className="flex-1">{t(btn.labelKey)}</span>
              {pinnedIds.includes(btn.id) && <Pin className="ml-2 h-3 w-3 text-muted-foreground" />}
            </DropdownMenuItem>
          );
        })}
        {showHudToggle && (
          <DropdownMenuItem onClick={() => {
            import("@/store/hud-store").then(({ useHudStore }) => {
              const s = useHudStore.getState();
              s.toggle();
              if (useHudStore.getState().enabled && menuConvId) {
                setTimeout(() => wsManager.send({ type: "send_message", conversationId: menuConvId, content: "/hud" }), 300);
              }
            });
          }}>
            <Activity className="h-4 w-4" />
            HUD
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSettingsOpen}>
          <Settings className="h-4 w-4" />
          {t("chat.header.settings")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
  const convType = type === "direct" ? "h2a" : type === "lounge" ? "h2a" : type;

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
            className={cn("h-9 w-9 md:h-8 md:w-8", activeColor)}
            onClick={() => onAction(btn.id)}
            disabled={btn.id === "call" && isInCall}
            title={t(btn.labelKey)}
          >
            <Icon className="h-4 w-4" />
          </Button>
        );
      })}

      <HamburgerMenu
        items={available}
        onAction={onAction}
        onSettingsOpen={onSettingsOpen}
        pinnedIds={pinnedIds}
        getMuteIcon={getMuteIcon}
        isInCall={isInCall}
        showHudToggle={!!agentId}
        conversationId={conversationId}
        t={t}
      />
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
  pendingCount?: number;
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
  pendingCount = 0,
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
        const showBadge = btn.id === "members" && pendingCount > 0;
        // On mobile, only show search + members for community; hide mute/wiki/threads
        const mobileHidden = isCommunity && !["search", "members"].includes(btn.id);
        return (
          <Button
            key={btn.id}
            variant="ghost"
            size="icon"
            className={cn("h-9 w-9 md:h-8 md:w-8 relative", activeColor, mobileHidden && "hidden md:inline-flex")}
            onClick={() => onAction(btn.id)}
            title={t(btn.labelKey)}
          >
            <Icon className="h-4 w-4" />
            {showBadge && (
              <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-semibold leading-none">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </Button>
        );
      })}

      <HamburgerMenu
        items={GROUP_HEADER_BUTTONS}
        onAction={onAction}
        onSettingsOpen={onSettingsOpen}
        pinnedIds={!isCommunity ? groupPins : []}
        getMuteIcon={getMuteIcon}
        t={t}
      />
    </>
  );
}

