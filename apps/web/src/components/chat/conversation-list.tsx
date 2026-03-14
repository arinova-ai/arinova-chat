"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import { MessageCirclePlus } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { ConversationItem } from "./conversation-item";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Tab = "all" | "agents" | "friends" | "groups" | "officials" | "communities" | "lounges";
const TABS: Tab[] = ["all", "agents", "friends", "groups", "officials", "communities", "lounges"];

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
  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const updateConversation = useChatStore((s) => s.updateConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const agentHealth = useChatStore((s) => s.agentHealth);
  const thinkingAgents = useChatStore((s) => s.thinkingAgents);
  const mutedConversations = useChatStore((s) => s.mutedConversations);
  const toggleMuteConversation = useChatStore((s) => s.toggleMuteConversation);

  const [tab, setTab] = useState<Tab>("all");
  const [pinnedOrder, setPinnedOrder] = useState<string[]>(loadPinnedOrder);

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
      filtered = conversations.filter((c) => c.type === "community");
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
        <div className="shrink-0 grid grid-cols-4 gap-1 px-2 pb-2">
          {TABS.map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => setTab(tb)}
              className={cn(
                "truncate rounded-md px-1 py-0.5 text-[10px] font-medium text-center transition-colors",
                tab === tb
                  ? "bg-blue-600 text-white"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {t(`chat.tab.${tb}`)}
            </button>
          ))}
        </div>
      )}

      {/* Conversation list */}
      <div className={cn("flex-1 min-w-0 overflow-y-auto py-1", collapsed ? "px-1" : "px-2")}>
        {sorted.length === 0 ? (
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
