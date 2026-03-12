"use client";

import { SquareKanban, ChevronRight } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { useTranslation } from "@/lib/i18n";

interface TaskShareMetadata {
  cardId: string;
  title: string;
  preview?: string | null;
  priority?: string | null;
  columnName?: string | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-400",
  high: "bg-orange-500/15 text-orange-400",
  medium: "bg-blue-500/15 text-blue-400",
  low: "bg-slate-500/15 text-slate-400",
};

export function TaskPreviewCard({ metadata }: { metadata: TaskShareMetadata }) {
  const { t } = useTranslation();
  const openKanbanSidebar = useChatStore((s) => s.openKanbanSidebar);
  const priorityCfg = PRIORITY_COLORS[metadata.priority ?? "medium"] ?? PRIORITY_COLORS.medium;

  return (
    <button
      type="button"
      onClick={() => openKanbanSidebar()}
      className="mt-2 w-full max-w-[320px] rounded-lg border border-border bg-card p-3 text-left hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-start gap-2">
        <SquareKanban className="h-4 w-4 mt-0.5 text-brand shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{metadata.title}</p>
          <div className="flex items-center gap-1.5 mt-1">
            {metadata.priority && (
              <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${priorityCfg}`}>
                {metadata.priority}
              </span>
            )}
            {metadata.columnName && (
              <span className="text-[10px] text-muted-foreground">
                {metadata.columnName}
              </span>
            )}
          </div>
          {metadata.preview && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{metadata.preview}</p>
          )}
          <div className="flex items-center gap-1 mt-1.5 text-xs text-brand-text font-medium">
            <span>{t("chat.kanban.openTask")}</span>
            <ChevronRight className="h-3 w-3" />
          </div>
        </div>
      </div>
    </button>
  );
}
