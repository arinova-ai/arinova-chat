"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChatStore } from "@/store/chat-store";
import { ChatHeader } from "./chat-header";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { HudBar } from "./hud-bar";
import { StickerPanel } from "./sticker-panel";
import { EmptyState } from "./empty-state";
import { BotManageDialog } from "./bot-manage-dialog";
import { SearchResults } from "./search-results";
import { NotebookList } from "./notebook-list";
import { KanbanSidebar } from "./kanban-sidebar";
import { WikiPanel } from "./wiki-panel";

import { GroupMembersPanel, type PanelTab } from "./group-members-panel";
import { CommunityMembersPanel } from "./community-members-panel";
import { CommunityAgentSheet } from "./community-agent-sheet";
import { AddMemberSheet } from "./add-member-sheet";
import { ThreadPanel } from "./thread-panel";
import { ThreadListSheet } from "./thread-list-sheet";
import { MediaFilesPanel, type MediaFilesTab } from "./media-files-panel";
import { PinnedMessagesBar } from "./pinned-messages-bar";
import { Upload } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { isGroupLike } from "@/lib/utils";
import { api } from "@/lib/api";
import { assetUrl } from "@/lib/config";
import { useRenderDiag } from "@/lib/chat-diagnostics";
import { ErrorBoundary } from "./error-boundary";
import { useRightPanelStore } from "@/store/right-panel-store";
import { ChatCardDetailSheet } from "./chat-card-detail-sheet";
import { ChatNoteDetailSheet } from "./chat-note-detail-sheet";

export function ChatArea() {
  const { t } = useTranslation();
  const router = useRouter();
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const searchActive = useChatStore((s) => s.searchActive);
  const conversations = useChatStore((s) => s.conversations);
  const messagesByConversation = useChatStore((s) => s.messagesByConversation);
  const agents = useChatStore((s) => s.agents);

  const conversationMembers = useChatStore((s) => s.conversationMembers);
  const notebookOpen = useChatStore((s) => s.notebookOpen);
  const kanbanSidebarOpen = useChatStore((s) => s.kanbanSidebarOpen);
  const openNotebook = useChatStore((s) => s.openNotebook);
  const closeNotebook = useChatStore((s) => s.closeNotebook);
  const openKanbanSidebar = useChatStore((s) => s.openKanbanSidebar);
  const closeKanbanSidebar = useChatStore((s) => s.closeKanbanSidebar);


  const [manageOpen, setManageOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [communityMembersOpen, setCommunityMembersOpen] = useState(false);
  const [resolvedCommunityId, setResolvedCommunityId] = useState<string | null>(null);
  const [membersPanelTab, setMembersPanelTab] = useState<PanelTab>("members");
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [threadListOpen, setThreadListOpen] = useState(false);
  const [mediaFilesOpen, setMediaFilesOpen] = useState(false);
  const [mediaFilesTab, setMediaFilesTab] = useState<MediaFilesTab>("media");
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[] | null>(null);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [communityAgentSheet, setCommunityAgentSheet] = useState<{ agentId: string } | null>(null);
  const dragCounterRef = useRef(0);

  const [chatBgUrl, setChatBgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!activeConversationId) return;
    setChatBgUrl(null);
    api<{ chatBgUrl: string | null }>(`/api/conversations/${activeConversationId}/settings`, { silent: true })
      .then((d) => setChatBgUrl(d.chatBgUrl))
      .catch(() => {});
  }, [activeConversationId]);

  // Listen for background changes from settings panel
  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent).detail?.url ?? null;
      setChatBgUrl(url);
    };
    window.addEventListener("chat-bg-changed", handler);
    return () => window.removeEventListener("chat-bg-changed", handler);
  }, []);

  useRenderDiag("ChatArea", () => ({
    activeConversationId,
    searchActive,
    conversationCount: conversations.length,
  }));

  // Close sticker panel and reset state when switching conversations
  useEffect(() => {
    setStickerOpen(false);
    setCommunityMembersOpen(false);
    setResolvedCommunityId(null);
  }, [activeConversationId]);

  // Listen for community agent profile clicks from message-bubble
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.agentId) {
        setCommunityAgentSheet({ agentId: detail.agentId });
      }
    };
    window.addEventListener("community-agent-profile", handler);
    return () => window.removeEventListener("community-agent-profile", handler);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes("application/x-arinova-note") || e.dataTransfer.types.includes("application/x-arinova-kanban-card")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    // Check for note drop — attach to input box (user sends with optional text)
    const noteData = e.dataTransfer.getData("application/x-arinova-note");
    if (noteData) {
      try {
        const note = JSON.parse(noteData) as { id: string; title: string; preview?: string };
        useChatStore.getState().setAttachedCard({
          type: "note",
          id: note.id,
          title: note.title,
          preview: note.preview,
        });
        return;
      } catch { /* fall through */ }
    }

    // Check for kanban card drop — attach to input box (user sends with optional text)
    const kanbanData = e.dataTransfer.getData("application/x-arinova-kanban-card");
    if (kanbanData) {
      try {
        const card = JSON.parse(kanbanData) as { id: string; title: string; preview?: string };
        useChatStore.getState().setAttachedCard({
          type: "kanban",
          id: card.id,
          title: card.title,
          preview: card.preview,
        });
        return;
      } catch { /* fall through */ }
    }

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setDroppedFiles(Array.from(files));
    }
  }, []);

  if (searchActive) {
    return <SearchResults />;
  }

  if (!activeConversationId) {
    return <div className="relative flex h-full w-full flex-1 flex-col"><EmptyState /></div>;
  }

  const conversation = conversations.find(
    (c) => c.id === activeConversationId
  );
  if (!conversation) return <div className="relative flex h-full w-full flex-1 flex-col"><EmptyState /></div>;

  const messages = messagesByConversation[activeConversationId] ?? [];

  // Look up full agent object for the manage dialog
  const agent = conversation.agentId
    ? agents.find((a) => a.id === conversation.agentId)
    : undefined;

  const openMembersPanel = (tab: PanelTab = "members") => {
    setMembersPanelTab(tab);
    setMembersOpen(true);
  };

  return (
    <div
      className="relative flex h-full min-w-0 flex-col"
      style={chatBgUrl ? {
        backgroundImage: `url(${assetUrl(chatBgUrl)})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      } : undefined}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {chatBgUrl && (
        <div className="pointer-events-none absolute inset-0 bg-black/40" />
      )}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="h-12 w-12" />
            <p className="text-lg font-medium">{t("chat.dragDrop")}</p>
          </div>
        </div>
      )}
      <ChatHeader
        agentName={conversation.agentName}
        agentDescription={conversation.agentDescription}
        agentAvatarUrl={conversation.agentAvatarUrl}
        type={conversation.type}
        conversationId={conversation.id}
        agentId={conversation.agentId ?? undefined}
        peerUserId={conversation.peerUserId}
        mentionOnly={conversation.mentionOnly}
        title={conversation.title}
        memberCount={isGroupLike(conversation.type) ? (conversationMembers[conversation.id]?.length ?? 0) : undefined}
        onClick={conversation.type === "community" ? (async () => {
          try {
            const data = await api<{ id: string }>(`/api/communities/by-conversation/${conversation.id}`);
            router.push(`/community/${data.id}`);
          } catch { /* ignore */ }
        }) : conversation.type === "lounge" ? (() => {
          const loungeId = (conversation as unknown as Record<string, unknown>).loungeAccountId as string | undefined
            ?? conversation.officialCommunityId;
          if (loungeId) {
            router.push(`/lounge/${loungeId}`);
          } else {
            router.push("/explore/lounge");
          }
        }) : (conversation.isVerified && conversation.accountId) ? (() => {
          router.push(`/official/${conversation.accountId}`);
        }) : (agent ? () => setManageOpen(true) : undefined) as (() => void) | undefined}
        onMembersClick={isGroupLike(conversation.type) ? async () => {
          if (conversation.type === "community") {
            const cid = conversation.officialCommunityId
              || resolvedCommunityId
              || await api<{ id: string }>(`/api/communities/by-conversation/${conversation.id}`, { silent: true }).then((d) => d.id).catch(() => null);
            if (cid) {
              setResolvedCommunityId(cid);
              setCommunityMembersOpen(true);
            }
          } else if (window.matchMedia("(min-width: 1280px)").matches) {
            useRightPanelStore.getState().setActiveTab("members");
          } else {
            openMembersPanel("members");
          }
        } : undefined}
        onSettingsClick={isGroupLike(conversation.type) ? () => openMembersPanel("settings") : undefined}
        onThreadsClick={() => {
          if (window.matchMedia("(min-width: 1280px)").matches) {
            useRightPanelStore.getState().setActiveTab("threads");
          } else {
            setThreadListOpen(true);
          }
        }}
        onKanbanClick={() => {
          if (window.matchMedia("(min-width: 1280px)").matches) {
            useRightPanelStore.getState().setActiveTab("kanban");
          } else {
            openKanbanSidebar();
          }
        }}
        onNotebookClick={() => {
          if (window.matchMedia("(min-width: 1280px)").matches) {
            useRightPanelStore.getState().setActiveTab("notes");
          } else {
            openNotebook();
          }
        }}
        onWikiClick={isGroupLike(conversation.type) ? () => {
          if (window.matchMedia("(min-width: 1280px)").matches) {
            useRightPanelStore.getState().setActiveTab("wiki");
          } else {
            setWikiOpen(true);
          }
        } : undefined}
        onPhotosClick={() => { setMediaFilesTab("media"); setMediaFilesOpen(true); }}
        onFilesClick={() => { setMediaFilesTab("files"); setMediaFilesOpen(true); }}
        officialCommunityId={conversation.officialCommunityId}
        isVerified={conversation.isVerified}
      />
      <ErrorBoundary scope="PinnedMessagesBar">
        {activeConversationId && <PinnedMessagesBar conversationId={activeConversationId} />}
      </ErrorBoundary>
      <ErrorBoundary scope="MessageList">
        <MessageList key={activeConversationId} messages={messages} agentName={conversation.agentName} isGroupConversation={isGroupLike(conversation.type)} />
      </ErrorBoundary>
      <HudBar />
      <ErrorBoundary scope="ChatInput">
        <ChatInput
          droppedFiles={droppedFiles}
          onDropHandled={() => setDroppedFiles(null)}
          stickerOpen={stickerOpen}
          onStickerToggle={() => setStickerOpen((prev) => !prev)}
        />
      </ErrorBoundary>
      <StickerPanel open={stickerOpen} onClose={() => setStickerOpen(false)} />

      {agent && (
        <BotManageDialog
          agent={agent}
          open={manageOpen}
          onOpenChange={setManageOpen}
        />
      )}

      {isGroupLike(conversation.type) && (
        <>
          {conversation.type === "community" && (conversation.officialCommunityId || resolvedCommunityId) ? (
            <CommunityMembersPanel
              open={communityMembersOpen}
              onClose={() => setCommunityMembersOpen(false)}
              communityId={(conversation.officialCommunityId || resolvedCommunityId) as string}
              canManage
            />
          ) : (
            <GroupMembersPanel
              open={membersOpen}
              onOpenChange={setMembersOpen}
              conversationId={conversation.id}
              initialTab={membersPanelTab}
              onAddMemberClick={() => setAddMemberOpen(true)}
            />
          )}
          <AddMemberSheet
            open={addMemberOpen}
            onOpenChange={setAddMemberOpen}
            conversationId={conversation.id}
          />

          {/* Agent profile sheet for community conversations */}
          {communityAgentSheet && conversation.type === "community" && (conversation.officialCommunityId || resolvedCommunityId) && (
            <CommunityAgentSheetLoader
              communityId={(conversation.officialCommunityId || resolvedCommunityId) as string}
              agentId={communityAgentSheet.agentId}
              onClose={() => setCommunityAgentSheet(null)}
            />
          )}
        </>
      )}

      <ErrorBoundary scope="ThreadPanel">
        <ThreadPanel />
      </ErrorBoundary>
      <ErrorBoundary scope="ThreadListSheet">
        <ThreadListSheet
          open={threadListOpen}
          onOpenChange={setThreadListOpen}
          conversationId={activeConversationId}
        />
      </ErrorBoundary>
      <MediaFilesPanel
        open={mediaFilesOpen}
        onOpenChange={setMediaFilesOpen}
        conversationId={conversation.id}
        initialTab={mediaFilesTab}
      />

      <NotebookList
        open={notebookOpen}
        onOpenChange={(open) => { if (!open) closeNotebook(); }}
        conversationId={activeConversationId}
      />
      <KanbanSidebar
        open={kanbanSidebarOpen}
        onOpenChange={(open) => { if (!open) closeKanbanSidebar(); }}
        conversationId={activeConversationId}
      />
      {isGroupLike(conversation.type) && (
        <WikiPanel
          open={wikiOpen}
          onOpenChange={setWikiOpen}
          conversationId={activeConversationId}
          communityId={conversation.officialCommunityId ?? undefined}
        />
      )}
      <ChatCardDetailSheet />
      <ChatNoteDetailSheet />
    </div>
  );
}

function CommunityAgentSheetLoader({ communityId, agentId, onClose }: { communityId: string; agentId: string; onClose: () => void }) {
  const [agent, setAgent] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    api<{ agents: Record<string, unknown>[] }>(`/api/communities/${communityId}/agents`, { silent: true })
      .then((d) => {
        const found = d.agents.find((a) => a.id === agentId);
        setAgent(found ?? null);
      })
      .catch(() => setAgent(null));
  }, [communityId, agentId]);

  if (!agent) return null;
  return (
    <CommunityAgentSheet
      open
      onOpenChange={(open) => !open && onClose()}
      communityId={communityId}
      agent={agent as never}
    />
  );
}
