"use client";

import { useChatStore } from "@/store/chat-store";
import { ChatHeader } from "./chat-header";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { EmptyState } from "./empty-state";

export function ChatArea() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const messagesByConversation = useChatStore((s) => s.messagesByConversation);

  if (!activeConversationId) {
    return <EmptyState />;
  }

  const conversation = conversations.find(
    (c) => c.id === activeConversationId
  );
  if (!conversation) return <EmptyState />;

  const messages = messagesByConversation[activeConversationId] ?? [];

  return (
    <div className="flex h-full flex-col">
      <ChatHeader
        agentName={conversation.agentName}
        agentDescription={conversation.agentDescription}
        type={conversation.type}
      />
      <MessageList messages={messages} agentName={conversation.agentName} />
      <ChatInput />
    </div>
  );
}
