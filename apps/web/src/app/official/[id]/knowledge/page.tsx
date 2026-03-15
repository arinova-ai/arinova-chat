"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  FileText,
  HelpCircle,
  Globe,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type KbTab = "file" | "faq" | "url";

interface KnowledgeItem {
  id: string;
  type: "file" | "faq" | "url";
  title: string;
  content?: string;
  fileUrl?: string;
  sourceUrl?: string;
  status: string;
  chunkCount?: number;
  createdAt: string;
}

export default function KnowledgeBasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useTranslation();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<KbTab>("file");
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editFileUrl, setEditFileUrl] = useState("");
  const [editSourceUrl, setEditSourceUrl] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ items: KnowledgeItem[] }>(
        `/api/accounts/${id}/knowledge`
      );
      setItems(data.items ?? []);
    } catch {
      // handled by api()
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const resetForm = () => {
    setTitle("");
    setContent("");
    setFileUrl("");
    setSourceUrl("");
  };

  const handleAdd = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const body: Record<string, string> = { type: activeTab, title: title.trim() };
      if (activeTab === "file" && fileUrl.trim()) body.fileUrl = fileUrl.trim();
      if (activeTab === "faq" && content.trim()) body.content = content.trim();
      if (activeTab === "url" && sourceUrl.trim()) body.sourceUrl = sourceUrl.trim();

      await api(`/api/accounts/${id}/knowledge`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      resetForm();
      fetchItems();
    } catch {
      // handled by api()
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (kbId: string) => {
    try {
      await api(`/api/accounts/${id}/knowledge/${kbId}`, {
        method: "DELETE",
      });
      setItems((prev) => prev.filter((item) => item.id !== kbId));
      if (editingId === kbId) setEditingId(null);
    } catch {
      // handled by api()
    }
  };

  const startEditing = (item: KnowledgeItem) => {
    if (editingId === item.id) {
      setEditingId(null);
      return;
    }
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditContent(item.content ?? "");
    setEditFileUrl(item.fileUrl ?? "");
    setEditSourceUrl(item.sourceUrl ?? "");
  };

  const handleSaveEdit = async (item: KnowledgeItem) => {
    setEditSaving(true);
    try {
      const body: Record<string, string> = { title: editTitle.trim() };
      if (item.type === "faq") body.content = editContent.trim();
      if (item.type === "file") body.fileUrl = editFileUrl.trim();
      if (item.type === "url") body.sourceUrl = editSourceUrl.trim();

      await api(`/api/accounts/${id}/knowledge/${item.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setEditingId(null);
      fetchItems();
    } catch {
      // handled by api()
    } finally {
      setEditSaving(false);
    }
  };

  const typeBadge = (type: KnowledgeItem["type"]) => {
    const styles: Record<string, string> = {
      file: "bg-blue-500/15 text-blue-600",
      faq: "bg-green-500/15 text-green-600",
      url: "bg-purple-500/15 text-purple-600",
    };
    const icons: Record<string, typeof FileText> = {
      file: FileText,
      faq: HelpCircle,
      url: Globe,
    };
    const Icon = icons[type];
    return (
      <Badge variant="outline" className={cn("gap-1", styles[type])}>
        <Icon className="h-3 w-3" />
        {t(`official.knowledge.type.${type}`)}
      </Badge>
    );
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      ready: "bg-green-500/15 text-green-600",
      processing: "bg-yellow-500/15 text-yellow-600",
      error: "bg-red-500/15 text-red-600",
      pending: "bg-gray-500/15 text-gray-500",
    };
    return (
      <Badge variant="outline" className={styles[status] ?? styles.pending}>
        {t(`official.knowledge.status.${status}`)}
      </Badge>
    );
  };

  const tabs: { id: KbTab; label: string; icon: typeof FileText }[] = [
    { id: "file", label: t("official.knowledge.tab.file"), icon: FileText },
    { id: "faq", label: t("official.knowledge.tab.faq"), icon: HelpCircle },
    { id: "url", label: t("official.knowledge.tab.url"), icon: Globe },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background pt-[env(safe-area-inset-top)]">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold truncate">
            {t("official.knowledge.title")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("official.knowledge.subtitle")}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchItems} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="flex-1 px-4 py-4 space-y-6 max-w-2xl mx-auto w-full">
        {/* Add Knowledge Section */}
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">
            {t("official.knowledge.addTitle")}
          </h2>

          {/* Tabs */}
          <div className="flex gap-1 mb-4">
            {tabs.map((tb) => {
              const Icon = tb.icon;
              return (
                <button
                  key={tb.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tb.id);
                    resetForm();
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    activeTab === tb.id
                      ? "bg-blue-600 text-white"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tb.label}
                </button>
              );
            })}
          </div>

          {/* Form Fields */}
          <div className="space-y-3">
            <Input
              placeholder={t("official.knowledge.titlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            {activeTab === "file" && (
              <Input
                placeholder={t("official.knowledge.fileUrlPlaceholder")}
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
              />
            )}

            {activeTab === "faq" && (
              <Textarea
                placeholder={t("official.knowledge.answerPlaceholder")}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
              />
            )}

            {activeTab === "url" && (
              <Input
                placeholder={t("official.knowledge.sourceUrlPlaceholder")}
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            )}

            <Button
              size="sm"
              onClick={handleAdd}
              disabled={submitting || !title.trim()}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t("official.knowledge.add")}
            </Button>
          </div>
        </section>

        {/* Knowledge Items List */}
        <section>
          <h2 className="text-sm font-semibold mb-3">
            {t("official.knowledge.itemsTitle")}
          </h2>

          {loading && items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("official.knowledge.loading")}
            </p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("official.knowledge.empty")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-border bg-card"
                >
                  <button
                    type="button"
                    onClick={() => startEditing(item)}
                    className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {typeBadge(item.type)}
                        {statusBadge(item.status)}
                        {item.chunkCount != null && (
                          <span className="text-xs text-muted-foreground">
                            {t("official.knowledge.chunks", {
                              count: item.chunkCount,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    {editingId === item.id ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>

                  {/* Expanded edit form */}
                  {editingId === item.id && (
                    <div className="border-t border-border p-3 space-y-3">
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder={t("official.knowledge.titlePlaceholder")}
                      />

                      {item.type === "faq" && (
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          placeholder={t("official.knowledge.answerPlaceholder")}
                          rows={4}
                        />
                      )}

                      {item.type === "file" && (
                        <Input
                          value={editFileUrl}
                          onChange={(e) => setEditFileUrl(e.target.value)}
                          placeholder={t("official.knowledge.fileUrlPlaceholder")}
                        />
                      )}

                      {item.type === "url" && (
                        <Input
                          value={editSourceUrl}
                          onChange={(e) => setEditSourceUrl(e.target.value)}
                          placeholder={t("official.knowledge.sourceUrlPlaceholder")}
                        />
                      )}

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(item)}
                          disabled={editSaving || !editTitle.trim()}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          {editSaving ? "..." : t("common.save")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingId(null)}
                        >
                          {t("common.cancel")}
                        </Button>
                        <div className="flex-1" />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(item.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
