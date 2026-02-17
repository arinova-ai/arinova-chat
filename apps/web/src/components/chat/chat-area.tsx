"use client";

import { useState } from "react";
import { useChatStore } from "@/store/chat-store";
import { ChatHeader } from "./chat-header";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { EmptyState } from "./empty-state";
import { BotManageDialog } from "./bot-manage-dialog";
import { SearchResults } from "./search-results";

export function ChatArea() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const searchActive = useChatStore((s) => s.searchActive);
  const conversations = useChatStore((s) => s.conversations);
  const messagesByConversation = useChatStore((s) => s.messagesByConversation);
  const agents = useChatStore((s) => s.agents);
  const agentHealth = useChatStore((s) => s.agentHealth);

  const [manageOpen, setManageOpen] = useState(false);

  if (searchActive) {
    return <SearchResults />;
  }

  if (!activeConversationId) {
    return <EmptyState />;
  }

  const conversation = conversations.find(
    (c) => c.id === activeConversationId
  );
  if (!conversation) return <EmptyState />;

  const messages = messagesByConversation[activeConversationId] ?? [];

  // Look up full agent object for the manage dialog
  const agent = conversation.agentId
    ? agents.find((a) => a.id === conversation.agentId)
    : undefined;

  const health = conversation.agentId
    ? agentHealth[conversation.agentId]
    : undefined;
  const isOnline = health?.status === "online";

  return (
    <div className="flex h-full min-w-0 flex-col">
      <ChatHeader
        agentName={conversation.agentName}
        agentDescription={conversation.agentDescription}
        agentAvatarUrl={conversation.agentAvatarUrl}
        isOnline={conversation.type === "direct" ? isOnline : undefined}
        type={conversation.type}
        onClick={agent ? () => setManageOpen(true) : undefined}
      />
      <MessageList messages={messages} agentName={conversation.agentName} />
      <ChatInput />

      {agent && (
        <BotManageDialog
          agent={agent}
          open={manageOpen}
          onOpenChange={setManageOpen}
        />
      )}
    </div>
  );
}
