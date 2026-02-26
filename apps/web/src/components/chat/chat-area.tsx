"use client";

import { useState } from "react";
import { useChatStore } from "@/store/chat-store";
import { useVoiceCallStore } from "@/store/voice-call-store";
import { ChatHeader } from "./chat-header";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { EmptyState } from "./empty-state";
import { BotManageDialog } from "./bot-manage-dialog";
import { SearchResults } from "./search-results";
import { ActiveCall } from "@/components/voice/active-call";
import { GroupMembersPanel, type PanelTab } from "./group-members-panel";
import { AddMemberSheet } from "./add-member-sheet";
import { ThreadPanel } from "./thread-panel";

export function ChatArea() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const searchActive = useChatStore((s) => s.searchActive);
  const conversations = useChatStore((s) => s.conversations);
  const messagesByConversation = useChatStore((s) => s.messagesByConversation);
  const agents = useChatStore((s) => s.agents);
  const agentHealth = useChatStore((s) => s.agentHealth);
  const conversationMembers = useChatStore((s) => s.conversationMembers);

  const callState = useVoiceCallStore((s) => s.callState);
  const callConversationId = useVoiceCallStore((s) => s.conversationId);

  const [manageOpen, setManageOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersPanelTab, setMembersPanelTab] = useState<PanelTab>("members");
  const [addMemberOpen, setAddMemberOpen] = useState(false);

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

  const showCallOverlay =
    callState !== "idle" && callConversationId === activeConversationId;

  const openMembersPanel = (tab: PanelTab = "members") => {
    setMembersPanelTab(tab);
    setMembersOpen(true);
  };

  return (
    <div className="relative flex h-full min-w-0 flex-col">
      <ChatHeader
        agentName={conversation.agentName}
        agentDescription={conversation.agentDescription}
        agentAvatarUrl={conversation.agentAvatarUrl}
        isOnline={conversation.type === "direct" ? isOnline : undefined}
        type={conversation.type}
        conversationId={conversation.id}
        agentId={conversation.agentId ?? undefined}
        voiceCapable={agent?.voiceCapable}
        mentionOnly={conversation.mentionOnly}
        title={conversation.title}
        memberCount={conversation.type === "group" ? (conversationMembers[conversation.id]?.length ?? 0) : undefined}
        onClick={agent ? () => setManageOpen(true) : undefined}
        onMembersClick={conversation.type === "group" ? () => openMembersPanel("members") : undefined}
        onSettingsClick={conversation.type === "group" ? () => openMembersPanel("settings") : undefined}
        onAddMemberClick={conversation.type === "group" ? () => setAddMemberOpen(true) : undefined}
      />
      <MessageList key={activeConversationId} messages={messages} agentName={conversation.agentName} isGroupConversation={conversation.type === "group"} />
      <ChatInput />

      {showCallOverlay && <ActiveCall />}

      {agent && (
        <BotManageDialog
          agent={agent}
          open={manageOpen}
          onOpenChange={setManageOpen}
        />
      )}

      {conversation.type === "group" && (
        <>
          <GroupMembersPanel
            open={membersOpen}
            onOpenChange={setMembersOpen}
            conversationId={conversation.id}
            initialTab={membersPanelTab}
          />
          <AddMemberSheet
            open={addMemberOpen}
            onOpenChange={setAddMemberOpen}
            conversationId={conversation.id}
          />
        </>
      )}

      <ThreadPanel />
    </div>
  );
}
