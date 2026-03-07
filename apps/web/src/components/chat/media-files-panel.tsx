"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ImageLightbox } from "./image-lightbox";
import { Loader2, FileText, Download } from "lucide-react";
import { api } from "@/lib/api";
import { assetUrl } from "@/lib/config";
import { useTranslation } from "@/lib/i18n";

export type MediaFilesTab = "media" | "files";

interface MediaItem {
  id: string;
  messageId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  url: string;
  createdAt: string;
  senderUserId: string | null;
  senderUserName: string | null;
  senderUserImage: string | null;
  senderAgentId: string | null;
  senderAgentName: string | null;
  messageCreatedAt: string;
}

interface MediaResponse {
  items: MediaItem[];
  hasMore: boolean;
  nextCursor: string | null;
}

interface TabState {
  items: MediaItem[];
  hasMore: boolean;
  nextCursor: string | null;
  loading: boolean;
  loaded: boolean;
}

const INITIAL_TAB: TabState = { items: [], hasMore: false, nextCursor: null, loading: false, loaded: false };

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

interface MediaFilesPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  initialTab?: MediaFilesTab;
}

export function MediaFilesPanel({ open, onOpenChange, conversationId, initialTab = "media" }: MediaFilesPanelProps) {
  const { t } = useTranslation();
  const tab = initialTab;
  const [media, setMedia] = useState<TabState>(INITIAL_TAB);
  const [files, setFiles] = useState<TabState>(INITIAL_TAB);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  // Reset when conversation changes or panel opens
  useEffect(() => {
    if (open) {
      setMedia(INITIAL_TAB);
      setFiles(INITIAL_TAB);
    }
  }, [open, conversationId, initialTab]);

  const fetchItems = useCallback(
    async (type: MediaFilesTab, cursor?: string | null) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      const setState = type === "media" ? setMedia : setFiles;
      setState((prev) => ({ ...prev, loading: true }));

      try {
        const endpoint = type === "media" ? "media" : "files";
        const params = new URLSearchParams();
        if (cursor) params.set("before", cursor);
        const qs = params.toString();
        const data = await api<MediaResponse>(
          `/api/conversations/${conversationId}/${endpoint}${qs ? `?${qs}` : ""}`
        );
        setState((prev) => ({
          items: cursor ? [...prev.items, ...data.items] : data.items,
          hasMore: data.hasMore,
          nextCursor: data.nextCursor,
          loading: false,
          loaded: true,
        }));
      } catch {
        setState((prev) => ({ ...prev, loading: false, loaded: true }));
      } finally {
        loadingRef.current = false;
      }
    },
    [conversationId]
  );

  // Fetch on open / tab switch
  useEffect(() => {
    if (!open) return;
    const state = tab === "media" ? media : files;
    if (!state.loaded && !state.loading) {
      fetchItems(tab);
    }
  }, [open, tab, media.loaded, media.loading, files.loaded, files.loading, fetchItems]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !open) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          const state = tab === "media" ? media : files;
          if (state.hasMore && !state.loading && state.nextCursor) {
            fetchItems(tab, state.nextCursor);
          }
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, tab, media, files, fetchItems]);

  const currentState = tab === "media" ? media : files;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 sm:max-w-sm p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-base">
            {tab === "media" ? t("chat.mediaFiles.media") : t("chat.mediaFiles.files")}
          </SheetTitle>
        </SheetHeader>

        <div className="border-b border-border" />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {currentState.loading && currentState.items.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {currentState.loaded && currentState.items.length === 0 && !currentState.loading && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {tab === "media" ? t("chat.mediaFiles.noMedia") : t("chat.mediaFiles.noFiles")}
            </p>
          )}

          {tab === "media" && currentState.items.length > 0 && (
            <MediaGrid items={currentState.items} />
          )}

          {tab === "files" && currentState.items.length > 0 && (
            <FileList items={currentState.items} />
          )}

          {/* Load more sentinel */}
          <div ref={sentinelRef} className="h-4" />

          {currentState.loading && currentState.items.length > 0 && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MediaGrid({ items }: { items: MediaItem[] }) {
  const gallery = items.map((item) => ({
    src: assetUrl(item.url),
    alt: item.fileName,
  }));

  return (
    <div className="grid grid-cols-3 gap-0.5 p-1">
      {items.map((item, index) => (
        <div key={item.id} className="group relative aspect-square">
          <ImageLightbox
            src={assetUrl(item.url)}
            alt={item.fileName}
            images={gallery}
            initialIndex={index}
            className="h-full w-full object-cover cursor-zoom-in"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <p className="truncate text-[10px] text-white">
              {item.senderUserName ?? item.senderAgentName ?? ""}
            </p>
            <p className="text-[10px] text-white/70">{formatDate(item.messageCreatedAt)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function FileList({ items }: { items: MediaItem[] }) {
  return (
    <div className="space-y-0.5 p-2">
      {items.map((item) => (
        <a
          key={item.id}
          href={assetUrl(item.url)}
          target="_blank"
          rel="noopener noreferrer"
          download={item.fileName}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent transition-colors"
        >
          <FileText className="h-8 w-8 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(item.fileSize)}
              {" · "}
              {item.senderUserName ?? item.senderAgentName ?? ""}
              {" · "}
              {formatDate(item.messageCreatedAt)}
            </p>
          </div>
          <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
        </a>
      ))}
    </div>
  );
}
