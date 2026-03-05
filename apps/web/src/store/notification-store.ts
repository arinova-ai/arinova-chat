import { create } from "zustand";

export interface InAppNotification {
  id: string;
  conversationId: string;
  senderName: string;
  senderImage?: string;
  preview: string;
  timestamp: number;
}

interface NotificationState {
  current: InAppNotification | null;
  show: (notification: Omit<InAppNotification, "id" | "timestamp">) => void;
  dismiss: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  current: null,
  show: (n) => {
    set({
      current: {
        ...n,
        id: Math.random().toString(36).slice(2),
        timestamp: Date.now(),
      },
    });
  },
  dismiss: () => set({ current: null }),
}));
