"use client";

import { useMemo, useState } from "react";
import { MessageCirclePlus } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { ConversationItem } from "./conversation-item";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Tab = "all" | "agents" | "friends" | "groups";
const TABS: Tab[] = ["all", "agents", "friends", "groups"];

export function ConversationList() {
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

  const sorted = useMemo(() => {
    let filtered = conversations;
    if (tab === "agents") {
      filtered = conversations.filter((c) => c.type === "direct" && c.agentId);
    } else if (tab === "friends") {
      filtered = conversations.filter((c) => c.type === "direct" && !c.agentId);
    } else if (tab === "groups") {
      filtered = conversations.filter((c) => c.type === "group");
    }

    return [...filtered].sort((a, b) => {
      if (a.pinnedAt && !b.pinnedAt) return -1;
      if (!a.pinnedAt && b.pinnedAt) return 1;
      if (a.pinnedAt && b.pinnedAt) {
        return new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime();
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [conversations, tab]);

  return (
    <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
      {/* Tab bar */}
      <div className="shrink-0 flex gap-1 px-3 pb-2">
        {TABS.map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => setTab(tb)}
            className={cn(
              "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
              tab === tb
                ? "bg-blue-600 text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            {t(`chat.tab.${tb}`)}
          </button>
        ))}
      </div>

      {/* Conversation list */}
      <div className="flex-1 min-w-0 overflow-y-auto px-2 py-1">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <MessageCirclePlus className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {t("chat.noConversations")}
            </p>
            <Button
              size="sm"
              onClick={() => window.dispatchEvent(new Event("arinova:new-chat"))}
            >
              {t("chat.newChat")}
            </Button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-0.5">
            {sorted.map((conv) => (
              <ConversationItem
                key={conv.id}
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
