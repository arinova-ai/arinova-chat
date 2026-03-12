"use client";

import { SquareKanban, ChevronRight, Flag } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

interface KanbanCardMetadata {
  cardId: string;
  title: string;
  preview?: string;
  priority?: string;
  columnName?: string;
}

const priorityConfig: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgent", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
  high: { label: "High", className: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  medium: { label: "Medium", className: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400" },
  low: { label: "Low", className: "bg-green-500/15 text-green-600 dark:text-green-400" },
};

export function KanbanCardPreview({ metadata }: { metadata: KanbanCardMetadata }) {
  const { t } = useTranslation();
  const prio = metadata.priority ? priorityConfig[metadata.priority] : null;

  return (
    <Link
      href={`/office/tasks?card=${metadata.cardId}`}
      className="mt-2 block w-full max-w-[320px] rounded-lg border border-border bg-card p-3 text-left hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-start gap-2">
        <SquareKanban className="h-4 w-4 mt-0.5 text-brand shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{metadata.title}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {metadata.columnName && (
              <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {metadata.columnName}
              </span>
            )}
            {prio && (
              <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${prio.className}`}>
                <Flag className="h-2 w-2" />
                {prio.label}
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
    </Link>
  );
}
