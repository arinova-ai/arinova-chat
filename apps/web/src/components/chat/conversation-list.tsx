"use client";

import { useMemo } from "react";
import { MessageCirclePlus } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { ConversationItem } from "./conversation-item";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

export function ConversationList() {
  const { t } = useTranslation();
  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const updateConversation = useChatStore((s) => s.updateConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const agentHealth = useChatStore((s) => s.agentHealth);
  const thinkingAgents = useChatStore((s) => s.thinkingAgents);

  const sorted = useMemo(() => {
    return [...conversations].sort((a, b) => {
      // Pinned conversations first
      if (a.pinnedAt && !b.pinnedAt) return -1;
      if (!a.pinnedAt && b.pinnedAt) return 1;
      if (a.pinnedAt && b.pinnedAt) {
        return new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime();
      }
      // Then by updatedAt descending
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [conversations]);

  return (
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
              isOnline={conv.agentId ? agentHealth[conv.agentId]?.status === "online" : false}
              isThinking={(thinkingAgents[conv.id]?.length ?? 0) > 0}
              isVerified={conv.isVerified}
              onDelete={() => deleteConversation(conv.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
