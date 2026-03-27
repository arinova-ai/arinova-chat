"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  BookText,
  Brain,
  SquareKanban,
  MessageSquare,
  UsersRound,
  MessagesSquare,
  PanelRightClose,
  Settings,
} from "lucide-react";
import { useRightPanelStore } from "@/store/right-panel-store";
import { useChatStore } from "@/store/chat-store";
import { useTranslation } from "@/lib/i18n";
import { cn, isGroupLike } from "@/lib/utils";
import { NotebookList } from "./notebook-list";
import { KanbanSidebar } from "./kanban-sidebar";
import { ThreadListContent } from "./thread-list-sheet";
import { GroupMembersPanel } from "./group-members-panel";
import { MemoryCapsuleSheet } from "./memory-capsule-sheet";
import { WikiPanel } from "./wiki-panel";
import { ChatHeaderSettingsInline } from "./chat-header-settings";

const TABS = [
  { id: "notes" as const, icon: BookOpen },
  { id: "wiki" as const, icon: BookText },
  { id: "kanban" as const, icon: SquareKanban },
  { id: "threads" as const, icon: MessageSquare },
  { id: "memory" as const, icon: Brain },
  { id: "members" as const, icon: UsersRound },
  { id: "chat" as const, icon: MessagesSquare },
  { id: "settings" as const, icon: Settings },
] as const;

const TAB_LABELS: Record<string, string> = {
  notes: "rightPanel.notes",
  wiki: "rightPanel.wiki",
  kanban: "rightPanel.kanban",
  threads: "rightPanel.threads",
  memory: "rightPanel.memory",
  members: "rightPanel.members",
  chat: "rightPanel.chat",
  settings: "rightPanel.settings",
};

export function RightPanel() {
  const { t } = useTranslation();
  const isOpen = useRightPanelStore((s) => s.isOpen);
  const activeTab = useRightPanelStore((s) => s.activeTab);
  const panelWidth = useRightPanelStore((s) => s.panelWidth);
  const setOpen = useRightPanelStore((s) => s.setOpen);
  const setActiveTab = useRightPanelStore((s) => s.setActiveTab);
  const setPanelWidth = useRightPanelStore((s) => s.setPanelWidth);
  const sideChatConversationId = useRightPanelStore(
    (s) => s.sideChatConversationId,
  );

  const activeConversation = useChatStore((s) => {
    const id = s.activeConversationId;
    return id ? s.conversations.find((c) => c.id === id) : undefined;
  });
  const isGroup = isGroupLike(activeConversation?.type);

  // Auto-hide on small viewports
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    setIsWide(mq.matches);
    const handler = (e: MediaQueryListEvent) => {
      setIsWide(e.matches);
      if (!e.matches) setOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [setOpen]);

  // Drag-to-resize
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startW.current = panelWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        // Dragging left edge: moving left increases width
        const delta = startX.current - ev.clientX;
        setPanelWidth(startW.current + delta);
      };
      const onMouseUp = () => {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [panelWidth, setPanelWidth],
  );

  const hasAgent = !!activeConversation?.agentId;

  const isCommunity = activeConversation?.type === "community";
  const visibleTabs = TABS.filter((tab) => {
    if (tab.id === "wiki" && !isGroup) return false;
    if (tab.id === "members" && !isGroup) return false;
    if (tab.id === "memory" && !hasAgent) return false;
    if (tab.id === "chat" && !sideChatConversationId) return false;
    if ((tab.id === "kanban" || tab.id === "notes") && isCommunity) return false;
    return true;
  });

  // Auto-reset tab when current tab is not visible (e.g. switching from group to direct)
  useEffect(() => {
    if (!isOpen || visibleTabs.length === 0) return;
    if (!visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [isOpen, activeTab, visibleTabs, setActiveTab]);

  if (!isWide || !isOpen) return null;

  return (
    <div
      className="relative hidden h-full shrink-0 flex-col border-l border-border bg-background xl:flex"
      style={{ width: panelWidth }}
    >
      {/* Drag handle */}
      <div
        className="absolute left-0 top-0 bottom-0 z-10 w-1 cursor-col-resize hover:bg-brand/30 active:bg-brand/50 transition-colors"
        onMouseDown={onMouseDown}
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 shrink-0">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              title={t(TAB_LABELS[tab.id])}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-brand/10 text-brand-text"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden 2xl:inline">
                {t(TAB_LABELS[tab.id])}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          title={t("rightPanel.close")}
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <TabContent tab={activeTab} />
      </div>
    </div>
  );
}

function TabContent({ tab }: { tab: string }) {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const activeConversation = useChatStore((s) => {
    const id = s.activeConversationId;
    return id ? s.conversations.find((c) => c.id === id) : undefined;
  });
  const sideChatConversationId = useRightPanelStore((s) => s.sideChatConversationId);

  if (!activeConversationId) return null;

  switch (tab) {
    case "notes":
      return <NotebookList inline conversationId={activeConversationId} open />;
    case "wiki":
      return (
        <WikiPanel
          inline
          conversationId={activeConversationId}
          communityId={activeConversation?.type === "community" ? activeConversation.officialCommunityId ?? undefined : undefined}
          open
        />
      );
    case "kanban":
      return <KanbanSidebar inline open onOpenChange={() => {}} conversationId={activeConversationId} />;
    case "threads":
      return <ThreadListContent conversationId={activeConversationId} />;
    case "memory":
      return activeConversation?.agentId ? (
        <MemoryCapsuleSheet
          inline
          open
          onOpenChange={() => {}}
          conversationId={activeConversationId}
          conversationName={activeConversation.agentName ?? ""}
          agentId={activeConversation.agentId}
        />
      ) : null;
    case "members":
      return <GroupMembersPanel inline open onOpenChange={() => {}} conversationId={activeConversationId} onAddMemberClick={() => window.dispatchEvent(new Event("open-add-member"))} />;
    case "chat":
      return sideChatConversationId ? (
        <div className="flex h-full items-center justify-center text-muted-foreground text-sm">Side chat: {sideChatConversationId}</div>
      ) : null;
    case "settings": {
      // For community conversations, use CommunitySettingsSheet (rendered elsewhere)
      // For other types, use inline settings
      const conv = useChatStore.getState().conversations.find((c) => c.id === activeConversationId);
      if (conv?.type === "community") {
        return <div className="flex h-full items-center justify-center text-muted-foreground text-sm">Community Settings</div>;
      }
      return <ChatHeaderSettingsInline conversationId={activeConversationId} />;
    }
    default:
      return null;
  }
}
