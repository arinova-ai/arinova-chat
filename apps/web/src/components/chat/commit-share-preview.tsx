"use client";

import { GitCommit } from "lucide-react";

interface CommitShareMetadata {
  commitHash: string;
  title: string;
  preview?: string;
}

export function CommitSharePreview({ metadata }: { metadata: CommitShareMetadata }) {
  const shortHash = metadata.commitHash?.slice(0, 7) || "";

  return (
    <div
      className="mt-2 block w-full max-w-[320px] rounded-lg border border-border bg-card p-3 text-left"
    >
      <div className="flex items-start gap-2">
        <GitCommit className="h-4 w-4 mt-0.5 text-brand shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{metadata.title}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground">
              {shortHash}
            </span>
          </div>
          {metadata.preview && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{metadata.preview}</p>
          )}
        </div>
      </div>
    </div>
  );
}
