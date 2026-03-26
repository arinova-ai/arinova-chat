"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { useTranslation } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
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
  Heart,
  Trash2,
  Pencil,
  ImageIcon,
  Smile,
} from "lucide-react";
import { BACKEND_URL } from "@/lib/config";

interface WikiPage {
  id: string;
  conversationId: string;
  title: string;
  content: string;
  tags: string[];
  isPinned: boolean;
  ownerId: string;
  authorName?: string | null;
  authorAvatar?: string | null;
  likeCount?: number;
  isLiked?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface WikiComment {
  id: string;
  wikiPageId: string;
  userId: string;
  userName?: string | null;
  userImage?: string | null;
  content: string;
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

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").trim();
}

type ViewMode = "list" | "detail" | "create";

export function WikiPanel({ conversationId, communityId, inline, open, onOpenChange }: WikiPanelProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;
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
  const [isEditing, setIsEditing] = useState(false);

  // Edit fields
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState("");

  // Create fields
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");

  // Like state
  const [likeCount, setLikeCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);

  // Comments
  const [comments, setComments] = useState<WikiComment[]>([]);
  const [newComment, setNewComment] = useState("");

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
    setEditTags((page.tags ?? []).join(", "));
    setIsEditing(false);
    setViewMode("detail");
    setLikeCount(page.likeCount ?? 0);
    setIsLiked(false);
    setComments([]);
    setNewComment("");
    // Fetch full page content + comments in parallel
    try {
      const [full, commentsRes] = await Promise.all([
        api<WikiPage>(`${wikiBase}/${page.id}`),
        api<{ comments: WikiComment[] }>(`/api/wiki/${page.id}/comments`, { silent: true }),
      ]);
      setSelectedPage(full);
      setEditTitle(full.title);
      setEditContent(full.content || "");
      setEditTags((full.tags ?? []).join(", "));
      setLikeCount(full.likeCount ?? 0);
      setIsLiked(full.isLiked ?? false);
      setComments(commentsRes.comments ?? []);
    } catch { /* keep list data */ }
  }, [wikiBase]);

  const handleSave = useCallback(async () => {
    if (!selectedPage || !editTitle.trim()) return;
    setSaving(true);
    try {
      const updated = await api<WikiPage>(
        `${wikiBase}/${selectedPage.id}`,
        { method: "PATCH", body: JSON.stringify({ title: editTitle.trim(), content: editContent, tags: editTags.split(",").map(t => t.trim()).filter(Boolean) }) },
      );
      setSelectedPage(updated);
      setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setIsEditing(false);
    } catch { /* api shows toast */ }
    setSaving(false);
  }, [selectedPage, wikiBase, editTitle, editContent, editTags]);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setSaving(true);
    try {
      const created = await api<WikiPage>(
        `${wikiBase}`,
        { method: "POST", body: JSON.stringify({ title, content: newContent, tags: newTags.split(",").map(t => t.trim()).filter(Boolean) }) },
      );
      setPages((prev) => [created, ...prev]);
      setNewTitle("");
      setNewContent("");
      setNewTags("");
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

  const handleDelete = async () => {
    if (!selectedPage) return;
    if (!window.confirm(t("wiki.confirmDeletePage"))) return;
    try {
      await api(`${wikiBase}/${selectedPage.id}`, { method: "DELETE" });
      setPages((prev) => prev.filter((p) => p.id !== selectedPage.id));
      setViewMode("list");
      setSelectedPage(null);
    } catch { /* api shows toast */ }
  };

  const handleToggleLike = async () => {
    if (!selectedPage) return;
    try {
      const res = await api<{ liked: boolean; likeCount: number }>(
        `/api/wiki/${selectedPage.id}/like`,
        { method: "POST" },
      );
      setIsLiked(res.liked);
      setLikeCount(res.likeCount);
      // Update in list too
      setPages((prev) => prev.map((p) => p.id === selectedPage.id ? { ...p, likeCount: res.likeCount } : p));
    } catch { /* ignore */ }
  };

  const handleAddComment = async () => {
    if (!selectedPage || !newComment.trim()) return;
    try {
      const comment = await api<WikiComment>(
        `/api/wiki/${selectedPage.id}/comments`,
        { method: "POST", body: JSON.stringify({ content: newComment.trim() }) },
      );
      setComments((prev) => [...prev, comment]);
      setNewComment("");
    } catch { /* api shows toast */ }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm(t("wiki.confirmDeleteComment"))) return;
    try {
      await api(`/api/wiki/comments/${commentId}`, { method: "DELETE" });
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch { /* api shows toast */ }
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

  const isOwner = selectedPage?.ownerId === currentUserId;

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
        {isOwner && !isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            title={t("wiki.edit")}
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
        {isOwner && !isEditing && (
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted/50 hover:text-red-500 transition-colors"
            title={t("wiki.delete")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        {isEditing && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md px-2 py-1 text-xs font-medium bg-brand text-white hover:bg-brand/90 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            {t("wiki.save")}
          </button>
        )}
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
        {/* Author info + like */}
        <div className="flex items-center gap-2">
          {selectedPage?.authorAvatar && (
            <img src={selectedPage.authorAvatar} alt="" className="h-5 w-5 rounded-full" />
          )}
          {selectedPage?.authorName && (
            <span className="text-xs text-muted-foreground">{selectedPage.authorName}</span>
          )}
          <span className="text-[10px] text-muted-foreground">{selectedPage ? formatTime(selectedPage.updatedAt) : ""}</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleToggleLike}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            <Heart className={cn("h-4 w-4", isLiked && "fill-red-500 text-red-500")} />
            <span>{likeCount}</span>
          </button>
        </div>
        {selectedPage?.tags && selectedPage.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {selectedPage.tags.map((tag: string) => (
              <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
            ))}
          </div>
        )}

        {isEditing ? (
          <>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder={t("wiki.titlePlaceholder")}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Input value={editTags} onChange={e => setEditTags(e.target.value)} placeholder={t("wiki.tagsPlaceholder")} />
            <NotebookEditor content={editContent} onChange={setEditContent} editable placeholder={t("wiki.contentPlaceholder")} uploadEndpoint="/api/wiki/upload" className="flex-1 min-h-0 rounded-md border border-border bg-background" />
          </>
        ) : (
          <>
            <NotebookEditor content={editContent} onChange={() => {}} editable={false} placeholder="" uploadEndpoint="/api/wiki/upload" className="rounded-md border border-border bg-background" />
          </>
        )}

        {/* Comments */}
        <div className="mt-4 border-t border-border pt-3 space-y-2">
          <h4 className="text-sm font-medium">{t("wiki.comments")} ({comments.length})</h4>
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2 py-1.5">
              <Avatar className="h-5 w-5 mt-0.5">
                {c.userImage && <AvatarImage src={c.userImage} alt="" />}
                <AvatarFallback>{(c.userName ?? "?").charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium">{c.userName || "Unknown"}</span>
                  <span className="text-[10px] text-muted-foreground">{formatTime(c.createdAt)}</span>
                </div>
                <div className="text-sm text-foreground space-y-1">
                  {c.content.split("\n").map((line, i) => {
                    const imgMatch = line.match(/^!\[.*?\]\((.*?)\)$/);
                    if (imgMatch) {
                      return <img key={i} src={imgMatch[1]} alt="" className="max-w-[200px] rounded-md mt-1" />;
                    }
                    return <p key={i}>{line}</p>;
                  })}
                </div>
              </div>
              {c.userId === currentUserId && (
                <button
                  type="button"
                  onClick={() => handleDeleteComment(c.id)}
                  className="rounded-md p-2 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          <div className="space-y-2">
            <div className="flex gap-2">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={t("wiki.commentPlaceholder")}
                rows={1}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAddComment();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleAddComment}
                disabled={!newComment.trim()}
                className="self-end rounded-md px-2 py-1 text-xs font-medium bg-brand text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
              >
                {t("wiki.commentPost")}
              </button>
            </div>
            <div className="flex gap-1">
              <label className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                <ImageIcon className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const formData = new FormData();
                    formData.append("file", file);
                    try {
                      const res = await fetch(`${BACKEND_URL}/api/uploads`, { method: "POST", credentials: "include", body: formData });
                      const data = await res.json();
                      if (data.url) {
                        setNewComment((prev) => prev + (prev ? "\n" : "") + `![image](${data.url})`);
                      }
                    } catch {}
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                onClick={() => {
                  setNewComment((prev) => prev + (prev ? " " : "") + "😊");
                }}
                title={t("wiki.addEmoji")}
              >
                <Smile className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
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
          onClick={() => { setViewMode("list"); setNewTitle(""); setNewContent(""); setNewTags(""); }}
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
            if (e.key === "Escape") { setViewMode("list"); setNewTitle(""); setNewContent(""); setNewTags(""); }
          }}
          placeholder={t("wiki.titlePlaceholder")}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Input value={newTags} onChange={e => setNewTags(e.target.value)} placeholder={t("wiki.tagsPlaceholder")} />
        <NotebookEditor content={newContent} onChange={setNewContent} editable placeholder={t("wiki.contentPlaceholder")} uploadEndpoint="/api/wiki/upload" className="flex-1 min-h-0 rounded-md border border-border bg-background"  />
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
                    {stripHtml(page.content).slice(0, 80)}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  {page.authorAvatar && <img src={page.authorAvatar} alt="" className="h-5 w-5 rounded-full" />}
                  {page.authorName && <span className="text-[10px] text-muted-foreground">{page.authorName}</span>}
                  <span className="text-[10px] text-muted-foreground">{formatTime(page.updatedAt)}</span>
                  {(page.likeCount ?? 0) > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <Heart className="h-3.5 w-3.5" />{page.likeCount}
                    </span>
                  )}
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
                    : "text-muted-foreground md:opacity-0 md:group-hover:opacity-100 hover:text-foreground",
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
