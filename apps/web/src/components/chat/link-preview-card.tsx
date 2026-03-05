"use client";

import { ExternalLink } from "lucide-react";
import type { LinkPreview } from "@arinova/shared/types";

interface LinkPreviewCardsProps {
  linkPreviews: LinkPreview[];
}

export function LinkPreviewCards({ linkPreviews }: LinkPreviewCardsProps) {
  if (linkPreviews.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {linkPreviews.map((preview) => (
        <LinkPreviewCard key={preview.url} preview={preview} />
      ))}
    </div>
  );
}

function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group/link flex overflow-hidden rounded-xl border border-border bg-background/50 hover:bg-accent/30 transition-colors"
    >
      {preview.imageUrl && (
        <div className="w-24 shrink-0 bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-2">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {preview.faviconUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.faviconUrl}
              alt=""
              className="h-3 w-3 rounded-sm"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <span className="truncate">{preview.domain ?? new URL(preview.url).hostname}</span>
          <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity" />
        </div>
        {preview.title && (
          <p className="text-xs font-medium text-foreground line-clamp-2 leading-tight">
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-tight">
            {preview.description}
          </p>
        )}
      </div>
    </a>
  );
}
