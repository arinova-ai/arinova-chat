"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { SquareKanban, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { KanbanBoard } from "@/components/kanban/kanban-board";

interface KanbanSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId?: string;
}

export function KanbanSidebar({ open, onOpenChange, conversationId }: KanbanSidebarProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !open) return null;

  const panel = (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <SquareKanban className="h-5 w-5 text-brand" />
          <h2 className="text-base font-semibold">{t("chat.kanban.title")}</h2>
        </div>
        <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg p-1 hover:bg-accent">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Board — full mode */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <KanbanBoard mode="full" conversationId={conversationId} />
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
