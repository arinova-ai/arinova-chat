import { create } from "zustand";

type TabType = "chat" | "notes" | "kanban" | "threads" | "members";

interface RightPanelState {
  isOpen: boolean;
  activeTab: TabType;
  sideChatConversationId: string | null;
  panelWidth: number;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setActiveTab: (tab: TabType) => void;
  setSideChatConversationId: (id: string | null) => void;
  setPanelWidth: (width: number) => void;
}

export const useRightPanelStore = create<RightPanelState>()((set) => ({
  isOpen: false,
  activeTab: "notes",
  sideChatConversationId: null,
  panelWidth: 380,
  setOpen: (open) => set({ isOpen: open }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  setActiveTab: (tab) => set({ activeTab: tab, isOpen: true }),
  setSideChatConversationId: (id) =>
    set({ sideChatConversationId: id, activeTab: "chat", isOpen: true }),
  setPanelWidth: (width) =>
    set({ panelWidth: Math.max(280, Math.min(600, width)) }),
}));
