"use client";

import { Tag, FileText, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";

interface NoteShareMetadata {
  noteId: string;
  title: string;
  preview: string;
  tags: string[];
}

export function NotePreviewCard({ metadata }: { metadata: NoteShareMetadata }) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push(`/office/notes?note=${metadata.noteId}`)}
      className="mt-2 w-full max-w-[320px] rounded-lg border border-border bg-card p-3 text-left hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-start gap-2">
        <FileText className="h-4 w-4 mt-0.5 text-brand shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{metadata.title}</p>
          {metadata.tags && metadata.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {metadata.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-0.5 rounded-full bg-brand/10 text-brand-text px-1.5 py-0.5 text-[10px] font-medium"
                >
                  <Tag className="h-2 w-2" />
                  {tag}
                </span>
              ))}
            </div>
          )}
          {metadata.preview && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{metadata.preview}</p>
          )}
          <div className="flex items-center gap-1 mt-1.5 text-xs text-brand-text font-medium">
            <span>{t("chat.notebook.openNote")}</span>
            <ChevronRight className="h-3 w-3" />
          </div>
        </div>
      </div>
    </button>
  );
}
