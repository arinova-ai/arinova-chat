"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { SquareKanban, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
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
  const isMobileRaw = useIsMobile();
  const isMobile = mounted ? isMobileRaw : false;

  if (!mounted || !open) return null;

  const backdrop = (
    <div
      className="fixed inset-0 z-50 bg-black/50 animate-in fade-in"
      onClick={() => onOpenChange(false)}
    />
  );

  const panel = (
    <div
      className={cn(
        "fixed z-50 shadow-lg animate-in overflow-hidden flex flex-col",
        isMobile
          ? "inset-x-0 bottom-0 rounded-t-2xl border-border bg-secondary px-2 pb-6 pt-3 max-h-[80vh] slide-in-from-bottom"
          : "inset-y-0 right-0 w-full sm:w-full sm:max-w-none p-0 flex flex-col bg-secondary border-l border-border slide-in-from-right"
      )}
    >
      {isMobile && <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <SquareKanban className="h-5 w-5 text-brand" />
          <h2 className="text-base font-semibold">{t("chat.kanban.title")}</h2>
        </div>
        <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg p-1 hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Board — compact mode */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <KanbanBoard mode="compact" conversationId={conversationId} />
      </div>
    </div>
  );

  return createPortal(
    <>
      {backdrop}
      {panel}
    </>,
    document.body
  );
}
