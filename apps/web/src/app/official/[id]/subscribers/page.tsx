"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  ShieldBan,
  ShieldCheck,
  Trash2,
  Plus,
  Tag,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { assetUrl, AGENT_DEFAULT_AVATAR } from "@/lib/config";
import { cn } from "@/lib/utils";

interface Subscriber {
  id: string;
  userId: string;
  userName: string;
  userImage?: string;
  subscribedAt: string;
  blocked?: boolean;
}

interface TagItem {
  id: string;
  name: string;
  color: string;
}

export default function SubscribersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useTranslation();
  const router = useRouter();

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Tag management
  const [tags, setTags] = useState<TagItem[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  const [tagsLoading, setTagsLoading] = useState(true);

  const fetchSubscribers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ subscribers: Subscriber[] } | Subscriber[]>(
        `/api/accounts/${id}/subscribers`
      );
      const list = Array.isArray(data) ? data : data.subscribers ?? [];
      setSubscribers(list);
    } catch {
      // handled by api()
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchTags = useCallback(async () => {
    setTagsLoading(true);
    try {
      const data = await api<{ tags: TagItem[] }>(
        `/api/accounts/${id}/tags`
      );
      setTags(data.tags ?? []);
    } catch {
      // handled by api()
    } finally {
      setTagsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSubscribers();
    fetchTags();
  }, [fetchSubscribers, fetchTags]);

  const handleBlock = async (userId: string) => {
    try {
      await api(`/api/accounts/${id}/subscribers/${userId}/block`, {
        method: "POST",
      });
      setSubscribers((prev) =>
        prev.map((s) => (s.userId === userId ? { ...s, blocked: true } : s))
      );
    } catch {
      // handled by api()
    }
  };

  const handleUnblock = async (userId: string) => {
    try {
      await api(`/api/accounts/${id}/subscribers/${userId}/unblock`, {
        method: "POST",
      });
      setSubscribers((prev) =>
        prev.map((s) => (s.userId === userId ? { ...s, blocked: false } : s))
      );
    } catch {
      // handled by api()
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      await api(`/api/accounts/${id}/tags`, {
        method: "POST",
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });
      setNewTagName("");
      fetchTags();
    } catch {
      // handled by api()
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    try {
      await api(`/api/accounts/${id}/tags/${tagId}`, {
        method: "DELETE",
      });
      setTags((prev) => prev.filter((tag) => tag.id !== tagId));
    } catch {
      // handled by api()
    }
  };

  const filtered = subscribers.filter((s) =>
    s.userName.toLowerCase().includes(search.toLowerCase())
  );

  const TAG_COLORS = [
    "#3b82f6",
    "#ef4444",
    "#22c55e",
    "#a855f7",
    "#f59e0b",
    "#ec4899",
    "#06b6d4",
    "#6366f1",
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
            {t("official.subscribers.title")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("official.subscribers.subtitle", {
              count: subscribers.length,
            })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            fetchSubscribers();
            fetchTags();
          }}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="flex-1 px-4 py-4 space-y-6 max-w-2xl mx-auto w-full">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("official.subscribers.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Subscriber List */}
        <section>
          <h2 className="text-sm font-semibold mb-3">
            {t("official.subscribers.listTitle")}
          </h2>

          {loading && subscribers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("official.subscribers.loading")}
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search
                ? t("official.subscribers.noResults")
                : t("official.subscribers.empty")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <img
                    src={
                      sub.userImage
                        ? assetUrl(sub.userImage)
                        : AGENT_DEFAULT_AVATAR
                    }
                    alt={sub.userName}
                    className="h-9 w-9 rounded-full object-cover bg-secondary"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {sub.userName}
                      </p>
                      {sub.blocked && (
                        <Badge
                          variant="destructive"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {t("official.subscribers.blocked")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("official.subscribers.subscribedAt", {
                        date: new Date(sub.subscribedAt).toLocaleDateString(),
                      })}
                    </p>
                  </div>
                  {sub.blocked ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnblock(sub.userId)}
                    >
                      <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                      {t("official.subscribers.unblock")}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleBlock(sub.userId)}
                      className="text-destructive hover:text-destructive"
                    >
                      <ShieldBan className="h-3.5 w-3.5 mr-1" />
                      {t("official.subscribers.block")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Tag Management */}
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Tag className="h-4 w-4" />
            {t("official.subscribers.tagsTitle")}
          </h2>

          {/* Add Tag */}
          <div className="flex gap-2 mb-4">
            <Input
              placeholder={t("official.subscribers.tagNamePlaceholder")}
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              className="flex-1"
            />
            <div className="flex gap-1 items-center">
              {TAG_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewTagColor(color)}
                  className={cn(
                    "h-6 w-6 rounded-full border-2 transition-transform",
                    newTagColor === color
                      ? "border-foreground scale-110"
                      : "border-transparent"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <Button
              size="sm"
              onClick={handleCreateTag}
              disabled={!newTagName.trim()}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t("official.subscribers.addTag")}
            </Button>
          </div>

          {/* Tag List */}
          {tagsLoading && tags.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {t("official.subscribers.loadingTags")}
            </p>
          ) : tags.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {t("official.subscribers.noTags")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="text-xs font-medium">{tag.name}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteTag(tag.id)}
                    className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
