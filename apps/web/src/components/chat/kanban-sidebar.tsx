"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { SquareKanban, X, Maximize2, Minimize2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useChatStore } from "@/store/chat-store";
import { KanbanBoard } from "@/components/kanban/kanban-board";

interface KanbanSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId?: string;
  inline?: boolean;
}

export function KanbanSidebar({ open, onOpenChange, conversationId, inline }: KanbanSidebarProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const kanbanFullscreen = useChatStore((s) => s.kanbanFullscreen);
  useEffect(() => setMounted(true), []);

  if (!mounted || !open) return null;

  const toggleFullscreen = () => useChatStore.getState().toggleKanbanFullscreen();

  // Inline mode with fullscreen active — render as fullscreen overlay via portal
  if (inline && kanbanFullscreen) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <SquareKanban className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold">{t("chat.kanban.title")}</h2>
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            title={t("rightPanel.kanban.collapse")}
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <KanbanBoard conversationId={conversationId} />
        </div>
      </div>,
      document.body,
    );
  }

  const panel = (
    <div
      className={inline ? "flex flex-col h-full bg-background" : "fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in"}
      style={inline ? undefined : {
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/* Inline toolbar with expand button */}
      {inline && (
        <div className="flex items-center justify-end px-2 py-1 border-b border-border shrink-0">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            title={t("rightPanel.kanban.expand")}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header — shown only in non-inline (mobile) mode */}
      {!inline && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <SquareKanban className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold">{t("chat.kanban.title")}</h2>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg p-1 hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Board — full mode */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <KanbanBoard conversationId={conversationId} />
      </div>
    </div>
  );

  if (inline) return panel;
  return createPortal(panel, document.body);
}
