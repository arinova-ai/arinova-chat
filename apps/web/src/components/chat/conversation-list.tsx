"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { MessageCirclePlus, ChevronLeft, ChevronRight, EyeOff, RotateCcw } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { useAccountStore } from "@/store/account-store";
import { ConversationItem } from "./conversation-item";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

type Tab = "all" | "agents" | "friends" | "groups" | "officials" | "communities" | "lounges" | "hidden";
const TABS: Tab[] = ["all", "agents", "friends", "groups", "officials", "communities", "lounges", "hidden"];

interface HiddenConversation {
  id: string;
  title: string | null;
  type: string;
  agentName: string | null;
  agentAvatarUrl: string | null;
  communityAvatarUrl: string | null;
  hiddenAt: string;
}

const PINNED_ORDER_KEY = "arinova-chat-pinned-order";

function loadPinnedOrder(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_ORDER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePinnedOrder(order: string[]) {
  localStorage.setItem(PINNED_ORDER_KEY, JSON.stringify(order));
}

export function ConversationList({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useTranslation();
  const allConversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const updateConversation = useChatStore((s) => s.updateConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const agentHealth = useChatStore((s) => s.agentHealth);
  const thinkingAgents = useChatStore((s) => s.thinkingAgents);
  const mutedConversations = useChatStore((s) => s.mutedConversations);
  const toggleMuteConversation = useChatStore((s) => s.toggleMuteConversation);

  // Account filtering
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accountConversations = useAccountStore((s) => s.accountConversations);
  const loadAccountConversations = useAccountStore((s) => s.loadAccountConversations);

  // Reload account conversations when activeAccountId changes
  useEffect(() => {
    if (activeAccountId) {
      loadAccountConversations(activeAccountId);
    }
  }, [activeAccountId, loadAccountConversations]);

  // Filter conversations: account mode shows only account conversations
  const conversations = useMemo(() => {
    if (!activeAccountId) return allConversations;
    const accountConvIds = new Set(accountConversations.map((c) => c.id));
    return allConversations.filter((c) => accountConvIds.has(c.id));
  }, [allConversations, activeAccountId, accountConversations]);

  const [tab, setTab] = useState<Tab>("all");
  const [communitySubTab, setCommunitySubTab] = useState<"all" | "joined" | "invites">("all");
  const [pinnedOrder, setPinnedOrder] = useState<string[]>(loadPinnedOrder);

  // Hidden conversations
  const [hiddenConvs, setHiddenConvs] = useState<HiddenConversation[]>([]);
  const [hiddenLoading, setHiddenLoading] = useState(false);

  useEffect(() => {
    if (tab !== "hidden") return;
    setHiddenLoading(true);
    api<HiddenConversation[]>("/api/conversations/hidden", { silent: true })
      .then(setHiddenConvs)
      .catch(() => setHiddenConvs([]))
      .finally(() => setHiddenLoading(false));
  }, [tab]);

  // Community invites
  interface CommunityInvite {
    id: string;
    communityId: string;
    communityName: string;
    communityAvatarUrl: string | null;
    inviterName: string | null;
    createdAt: string;
  }
  const [communityInvites, setCommunityInvites] = useState<CommunityInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);

  useEffect(() => {
    if (tab !== "communities") return;
    setInvitesLoading(true);
    api<{ invites: CommunityInvite[] }>("/api/community-invites/my", { silent: true })
      .then((d) => setCommunityInvites(d.invites))
      .catch(() => setCommunityInvites([]))
      .finally(() => setInvitesLoading(false));
  }, [tab]);

  const handleAcceptInvite = useCallback(async (inviteId: string) => {
    try {
      await api(`/api/community-invites/${inviteId}/accept`, { method: "POST" });
      setCommunityInvites((prev) => prev.filter((i) => i.id !== inviteId));
      useChatStore.getState().loadConversations();
    } catch {}
  }, []);

  const handleRejectInvite = useCallback(async (inviteId: string) => {
    try {
      await api(`/api/community-invites/${inviteId}/reject`, { method: "POST" });
      setCommunityInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch {}
  }, []);

  const handleUnhide = useCallback(async (id: string) => {
    await api(`/api/conversations/${id}/unhide`, { method: "PUT" });
    setHiddenConvs((prev) => prev.filter((c) => c.id !== id));
    // Refresh main conversation list
    useChatStore.getState().loadConversations();
  }, []);

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragNodeRef = useRef<HTMLElement | null>(null);

  const sorted = useMemo(() => {
    let filtered = conversations;
    if (tab === "agents") {
      filtered = conversations.filter((c) => (c.type === "h2a" || (c.type === "direct" && c.agentId)) && !c.officialCommunityId);
    } else if (tab === "friends") {
      filtered = conversations.filter((c) => (c.type === "h2h" || (c.type === "direct" && !c.agentId)) && !c.officialCommunityId);
    } else if (tab === "groups") {
      filtered = conversations.filter((c) => c.type === "group");
    } else if (tab === "officials") {
      filtered = conversations.filter((c) => c.type === "official" || !!c.officialCommunityId);
    } else if (tab === "communities") {
      filtered = conversations.filter((c) => c.type === "community" || (c.type as string) === "club");
    } else if (tab === "lounges") {
      filtered = conversations.filter((c) => c.type === "lounge");
    }

    return [...filtered].sort((a, b) => {
      if (a.pinnedAt && !b.pinnedAt) return -1;
      if (!a.pinnedAt && b.pinnedAt) return 1;
      if (a.pinnedAt && b.pinnedAt) {
        const aIdx = pinnedOrder.indexOf(a.id);
        const bIdx = pinnedOrder.indexOf(b.id);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime();
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [conversations, tab, pinnedOrder]);

  const pinnedIds = useMemo(
    () => sorted.filter((c) => c.pinnedAt).map((c) => c.id),
    [sorted],
  );

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDragId(id);
    dragNodeRef.current = e.currentTarget as HTMLElement;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    // Slight delay so the dragged element renders before opacity change
    requestAnimationFrame(() => {
      if (dragNodeRef.current) dragNodeRef.current.style.opacity = "0.4";
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragNodeRef.current) dragNodeRef.current.style.opacity = "1";
    setDragId(null);
    setDragOverId(null);
    dragNodeRef.current = null;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDragEnter = useCallback((id: string) => {
    setDragOverId(id);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;

    // Only reorder among pinned items
    if (!pinnedIds.includes(dragId) || !pinnedIds.includes(targetId)) return;

    const newOrder = [...pinnedIds];
    const fromIdx = newOrder.indexOf(dragId);
    const toIdx = newOrder.indexOf(targetId);
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragId);

    savePinnedOrder(newOrder);
    setPinnedOrder(newOrder);
  }, [dragId, pinnedIds]);

  return (
    <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
      {/* Tab bar — hidden when collapsed */}
      {!collapsed && (
        <div className="shrink-0 flex items-center px-1 pb-2">
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById("conv-tab-scroll");
              if (el) el.scrollBy({ left: -100, behavior: "smooth" });
            }}
            className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div id="conv-tab-scroll" className="flex-1 flex gap-1 overflow-x-auto scrollbar-none px-1">
            {TABS.map((tb) => (
              <button
                key={tb}
                type="button"
                onClick={() => setTab(tb)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === tb
                    ? "bg-brand text-white"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {t(`chat.tab.${tb}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById("conv-tab-scroll");
              if (el) el.scrollBy({ left: 100, behavior: "smooth" });
            }}
            className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Community sub-tabs */}
      {!collapsed && tab === "communities" && (
        <div className="flex gap-1 px-3 pb-2">
          {(["all", "joined", "invites"] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setCommunitySubTab(st)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                communitySubTab === st
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(`chat.communityTab.${st}`)}
              {st === "invites" && communityInvites.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                  {communityInvites.length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Conversation list */}
      <div className={cn("flex-1 min-w-0 overflow-y-auto py-1", collapsed ? "px-1" : "px-2")}>
        {tab === "communities" && communitySubTab === "invites" ? (
          invitesLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            </div>
          ) : communityInvites.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">{t("chat.communityTab.noInvites")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {communityInvites.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/50">
                  <div className="h-10 w-10 shrink-0 rounded-full bg-muted overflow-hidden">
                    {inv.communityAvatarUrl && (
                      <img src={inv.communityAvatarUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inv.communityName}</p>
                    {inv.inviterName && (
                      <p className="text-xs text-muted-foreground truncate">
                        {t("chat.communityTab.invitedBy", { name: inv.inviterName })}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="default" className="h-7 px-3 text-xs" onClick={() => handleAcceptInvite(inv.id)}>
                      {t("chat.communityTab.accept")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => handleRejectInvite(inv.id)}>
                      {t("chat.communityTab.reject")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : tab === "hidden" ? (
          hiddenLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            </div>
          ) : hiddenConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <EyeOff className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{t("chat.noHiddenConversations")}</p>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-1">
              {hiddenConvs.map((conv) => (
                <div
                  key={conv.id}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-secondary"
                >
                  <div className="h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                    {(conv.agentAvatarUrl || conv.communityAvatarUrl) ? (
                      <img src={conv.agentAvatarUrl || conv.communityAvatarUrl || ""} className="h-full w-full object-cover" alt="" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{conv.title || conv.agentName || conv.type}</p>
                    <p className="text-xs text-muted-foreground">{new Date(conv.hiddenAt).toLocaleDateString()}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleUnhide(conv.id)}
                    title={t("chat.unhide")}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <MessageCirclePlus className="h-10 w-10 text-muted-foreground/50" />
            {!collapsed && (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("chat.noConversations")}
                </p>
                <Button
                  size="sm"
                  onClick={() => window.dispatchEvent(new Event("arinova:new-chat"))}
                >
                  {t("chat.newChat")}
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-0.5">
            {sorted.map((conv) => {
              const isPinned = !!conv.pinnedAt;
              const canDrag = isPinned && !collapsed;
              return (
                <div
                  key={conv.id}
                  draggable={canDrag || undefined}
                  onDragStart={canDrag ? (e) => handleDragStart(e, conv.id) : undefined}
                  onDragEnd={canDrag ? handleDragEnd : undefined}
                  onDragOver={canDrag ? handleDragOver : undefined}
                  onDragEnter={canDrag ? () => handleDragEnter(conv.id) : undefined}
                  onDrop={canDrag ? (e) => handleDrop(e, conv.id) : undefined}
                  className={cn(
                    canDrag && "cursor-grab active:cursor-grabbing",
                    dragOverId === conv.id && dragId !== conv.id && isPinned && "border-t-2 border-primary"
                  )}
                >
                  <ConversationItem
                    id={conv.id}
                    title={conv.title}
                    agentName={conv.agentName}
                    agentDescription={conv.agentDescription}
                    agentAvatarUrl={conv.agentAvatarUrl}
                    type={conv.type}
                    lastMessage={conv.lastMessage}
                    pinnedAt={conv.pinnedAt}
                    updatedAt={conv.updatedAt}
                    isActive={conv.id === activeConversationId}
                    onClick={() => setActiveConversation(conv.id)}
                    onRename={(title) => updateConversation(conv.id, { title })}
                    onPin={(pinned) => updateConversation(conv.id, { pinned })}
                    unreadCount={unreadCounts[conv.id] ?? 0}
                    isOnline={conv.agentId ? agentHealth[conv.agentId]?.status === "online" : false}
                    isThinking={(thinkingAgents[conv.id]?.length ?? 0) > 0}
                    isVerified={conv.isVerified}
                    isMuted={!!mutedConversations[conv.id]}
                    onMuteToggle={() => toggleMuteConversation(conv.id)}
                    onDelete={() => deleteConversation(conv.id)}
                    collapsed={collapsed}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
