"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
const NotebookEditor = dynamic(() => import("./notebook-editor").then((m) => m.NotebookEditor), { ssr: false });
import {
  BookText,
  Plus,
  Pin,
  PinOff,
  Loader2,
  Tag,
  ChevronDown,
  X,
  ArrowLeft,
  Save,
} from "lucide-react";

interface WikiPage {
  id: string;
  conversationId: string;
  title: string;
  content: string;
  tags: string[];
  isPinned: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

interface WikiPanelProps {
  conversationId: string;
  communityId?: string;
  inline?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type ViewMode = "list" | "detail" | "create";

export function WikiPanel({ conversationId, communityId, inline, open, onOpenChange }: WikiPanelProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const wikiBase = communityId
    ? `/api/communities/${communityId}/wiki`
    : `/api/conversations/${conversationId}/wiki`;

  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedPage, setSelectedPage] = useState<WikiPage | null>(null);

  // Edit fields
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  // Create fields
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  // Escape key closes mobile overlay
  useEffect(() => {
    if (inline || !open || !onOpenChange) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (viewMode !== "list") {
          setViewMode("list");
          setSelectedPage(null);
        } else {
          onOpenChange(false);
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [inline, open, onOpenChange, viewMode]);

  const fetchPages = useCallback(async () => {
    if (!conversationId && !communityId) return;
    setLoading(true);
    try {
      const res = await api<{ pages: WikiPage[] }>(
        `${wikiBase}`,
        { silent: true },
      );
      setPages(res.pages);
    } catch { /* ignore */ }
    setLoading(false);
  }, [wikiBase, conversationId, communityId]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  // Collect all tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    pages.forEach((p) => p.tags?.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet).sort();
  }, [pages]);

  const toggleFilterTag = useCallback((tag: string) => {
    setFilterTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  // Sort: pinned first, then by updatedAt; filter by tags
  const sortedPages = useMemo(() => {
    let filtered = pages;
    if (filterTags.length > 0) {
      filtered = pages.filter((p) => filterTags.every((ft) => p.tags?.includes(ft)));
    }
    return [...filtered].sort((a, b) => {
      if (b.isPinned !== a.isPinned) return b.isPinned ? 1 : -1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [pages, filterTags]);

  const handleOpenPage = useCallback(async (page: WikiPage) => {
    setSelectedPage(page);
    setEditTitle(page.title);
    setEditContent(page.content || "");
    setViewMode("detail");
    // Fetch full page content
    try {
      const full = await api<WikiPage>(`${wikiBase}/${page.id}`);
      setSelectedPage(full);
      setEditTitle(full.title);
      setEditContent(full.content || "");
    } catch { /* keep list data */ }
  }, [wikiBase]);

  const handleSave = useCallback(async () => {
    if (!selectedPage || !editTitle.trim()) return;
    setSaving(true);
    try {
      const updated = await api<WikiPage>(
        `${wikiBase}/${selectedPage.id}`,
        { method: "PATCH", body: JSON.stringify({ title: editTitle.trim(), content: editContent }) },
      );
      setSelectedPage(updated);
      setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch { /* api shows toast */ }
    setSaving(false);
  }, [selectedPage, wikiBase, editTitle, editContent]);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setSaving(true);
    try {
      const created = await api<WikiPage>(
        `${wikiBase}`,
        { method: "POST", body: JSON.stringify({ title, content: newContent }) },
      );
      setPages((prev) => [created, ...prev]);
      setNewTitle("");
      setNewContent("");
      setViewMode("list");
    } catch { /* api shows toast */ }
    setSaving(false);
  };

  const handleBackToList = useCallback(() => {
    setViewMode("list");
    setSelectedPage(null);
  }, []);

  const handleTogglePin = async (page: WikiPage) => {
    try {
      const updated = await api<WikiPage>(
        `${wikiBase}/${page.id}`,
        { method: "PATCH", body: JSON.stringify({ isPinned: !page.isPinned }) },
      );
      setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch { /* ignore */ }
  };

  function formatTime(date: string): string {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  // Detail/Edit view
  const detailView = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <button
          type="button"
          onClick={handleBackToList}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold flex-1 truncate">{selectedPage?.title || ""}</span>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md px-2 py-1 text-xs font-medium bg-brand text-white hover:bg-brand/90 transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          {t("wiki.save")}
        </button>
        {!inline && onOpenChange && (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        <input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          placeholder={t("wiki.titlePlaceholder")}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <NotebookEditor content={editContent} onChange={setEditContent} editable placeholder={t("wiki.contentPlaceholder")} className="flex-1 min-h-0 rounded-md border border-border bg-background"  />
      </div>
    </div>
  );

  // Create view
  const createView = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <button
          type="button"
          onClick={() => { setViewMode("list"); setNewTitle(""); setNewContent(""); }}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold flex-1">{t("wiki.create")}</span>
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving || !newTitle.trim()}
          className="rounded-md px-2 py-1 text-xs font-medium bg-brand text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : t("wiki.add")}
        </button>
        {!inline && onOpenChange && (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        <input
          autoFocus
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setViewMode("list"); setNewTitle(""); setNewContent(""); }
          }}
          placeholder={t("wiki.titlePlaceholder")}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <NotebookEditor content={newContent} onChange={setNewContent} editable placeholder={t("wiki.contentPlaceholder")} className="flex-1 min-h-0 rounded-md border border-border bg-background"  />
      </div>
    </div>
  );

  // List view
  const listView = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <BookText className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold flex-1">{t("wiki.title")}</span>
        <button
          type="button"
          onClick={() => setViewMode("create")}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          title={t("wiki.create")}
        >
          <Plus className="h-4 w-4" />
        </button>
        {!inline && onOpenChange && (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors ml-1"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="px-3 pt-2 pb-1">
          <button
            type="button"
            onClick={() => setTagsExpanded((p) => !p)}
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground mb-1"
          >
            <Tag className="h-3 w-3" />
            Tags ({allTags.length})
            <ChevronDown className={cn("h-3 w-3 transition-transform", tagsExpanded && "rotate-180")} />
          </button>
          <div className={cn("flex flex-wrap gap-1", !tagsExpanded && "max-h-0 overflow-hidden")}>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleFilterTag(tag)}
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                  filterTags.includes(tag)
                    ? "bg-brand/20 text-brand-text"
                    : "bg-secondary text-muted-foreground hover:bg-accent",
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pages list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sortedPages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
            <BookText className="h-8 w-8 mb-2 opacity-50" />
            {t("wiki.empty")}
          </div>
        ) : (
          sortedPages.map((page) => (
            <div
              key={page.id}
              className="group relative flex items-start px-3 py-2.5 hover:bg-muted/50 transition-colors border-b border-border/50 cursor-pointer"
              onClick={() => handleOpenPage(page)}
            >
              {page.isPinned && <Pin className="h-3 w-3 text-brand-text mr-2 mt-0.5 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{page.title}</div>
                {page.content && (
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {page.content.slice(0, 80)}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">{formatTime(page.updatedAt)}</span>
                  {page.tags && page.tags.length > 0 && (
                    <div className="flex gap-0.5">
                      {page.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="rounded-full bg-secondary px-1.5 py-0 text-[9px] text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                      {page.tags.length > 2 && (
                        <span className="text-[9px] text-muted-foreground">+{page.tags.length - 2}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Pin/Unpin button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleTogglePin(page);
                }}
                className={cn(
                  "rounded-md p-1 transition-colors shrink-0",
                  page.isPinned
                    ? "text-brand-text hover:text-brand-text/70"
                    : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground",
                )}
                title={page.isPinned ? t("wiki.unpin") : t("wiki.pin")}
              >
                {page.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const content = viewMode === "detail" ? detailView : viewMode === "create" ? createView : listView;

  // Inline mode (right panel)
  if (inline) return content;

  // Mobile portal overlay
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {content}
    </div>,
    document.body,
  );
}
