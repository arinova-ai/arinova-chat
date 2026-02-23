"use client";

import { useChatStore } from "@/store/chat-store";
import { ConversationItem } from "./conversation-item";

export function ConversationList() {
  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const updateConversation = useChatStore((s) => s.updateConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const agentHealth = useChatStore((s) => s.agentHealth);
  const thinkingAgents = useChatStore((s) => s.thinkingAgents);

  return (
    <div className="flex-1 min-w-0 overflow-y-auto px-2 py-1">
      {conversations.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">
          No conversations yet
        </p>
      ) : (
        <div className="flex min-w-0 flex-col gap-0.5">
          {conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              id={conv.id}
              title={conv.title}
              agentName={conv.agentName}
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
              onDelete={() => deleteConversation(conv.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
