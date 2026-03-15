"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Send,
  Save,
  Trash2,
  Radio,
  Clock,
  Users,
  Eye,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";

interface Broadcast {
  id: string;
  content: string;
  status: "draft" | "scheduled" | "sent" | "failed";
  scheduledAt: string | null;
  sentAt: string | null;
  totalRecipients: number;
  deliveredCount: number;
  readCount: number;
  createdAt: string;
}

export default function BroadcastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: accountId } = use(params);
  const { t } = useTranslation();
  const router = useRouter();

  // Create form state
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"draft" | "scheduled">("draft");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  // History state
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBroadcasts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ broadcasts: Broadcast[] }>(
        `/api/accounts/${accountId}/broadcasts`
      );
      setBroadcasts(data.broadcasts);
    } catch {
      // handled by api helper
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchBroadcasts();
  }, [fetchBroadcasts]);

  const handleSaveDraft = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await api(`/api/accounts/${accountId}/broadcasts`, {
        method: "POST",
        body: JSON.stringify({
          content: content.trim(),
          status,
          scheduledAt: status === "scheduled" && scheduledAt ? scheduledAt : undefined,
        }),
      });
      setContent("");
      setStatus("draft");
      setScheduledAt("");
      fetchBroadcasts();
    } finally {
      setSaving(false);
    }
  };

  const handleSendNow = async () => {
    if (!content.trim()) return;
    setSending(true);
    try {
      const created = await api<Broadcast>(
        `/api/accounts/${accountId}/broadcasts`,
        {
          method: "POST",
          body: JSON.stringify({ content: content.trim(), status: "draft" }),
        }
      );
      await api(`/api/accounts/${accountId}/broadcasts/${created.id}/send`, {
        method: "POST",
      });
      setContent("");
      setStatus("draft");
      setScheduledAt("");
      fetchBroadcasts();
    } finally {
      setSending(false);
    }
  };

  const handleSendExisting = async (broadcastId: string) => {
    try {
      await api(
        `/api/accounts/${accountId}/broadcasts/${broadcastId}/send`,
        { method: "POST" }
      );
      fetchBroadcasts();
    } catch {
      // handled by api helper
    }
  };

  const handleDelete = async (broadcastId: string) => {
    try {
      await api(
        `/api/accounts/${accountId}/broadcasts/${broadcastId}`,
        { method: "DELETE" }
      );
      setBroadcasts((prev) => prev.filter((b) => b.id !== broadcastId));
    } catch {
      // handled by api helper
    }
  };

  const statusBadge = (s: Broadcast["status"]) => {
    const map: Record<
      Broadcast["status"],
      { label: string; className: string }
    > = {
      draft: {
        label: t("official.broadcast.statusDraft"),
        className: "bg-gray-500/15 text-gray-500",
      },
      scheduled: {
        label: t("official.broadcast.statusScheduled"),
        className: "bg-blue-500/15 text-blue-500",
      },
      sent: {
        label: t("official.broadcast.statusSent"),
        className: "bg-green-500/15 text-green-500",
      },
      failed: {
        label: t("official.broadcast.statusFailed"),
        className: "bg-red-500/15 text-red-500",
      },
    };
    const info = map[s];
    return (
      <Badge variant="outline" className={info.className}>
        {info.label}
      </Badge>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/official/${accountId}/dashboard`)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold truncate">
            {t("official.broadcast.title")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("official.broadcast.subtitle")}
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-6">
        {/* Create Broadcast */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold">
            {t("official.broadcast.create")}
          </h2>

          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("official.broadcast.contentPlaceholder")}
            rows={4}
            className="resize-none"
          />

          <div className="flex flex-wrap items-end gap-4">
            {/* Status selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t("official.broadcast.statusLabel")}
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStatus("draft")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    status === "draft"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("official.broadcast.statusDraft")}
                </button>
                <button
                  type="button"
                  onClick={() => setStatus("scheduled")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    status === "scheduled"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("official.broadcast.statusScheduled")}
                </button>
              </div>
            </div>

            {/* Schedule date picker */}
            {status === "scheduled" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {t("official.broadcast.scheduleDate")}
                </label>
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={!content.trim() || saving}
            >
              <Save className="mr-1.5 h-4 w-4" />
              {t("official.broadcast.saveDraft")}
            </Button>
            <Button
              onClick={handleSendNow}
              disabled={!content.trim() || sending}
            >
              <Send className="mr-1.5 h-4 w-4" />
              {t("official.broadcast.sendNow")}
            </Button>
          </div>
        </section>

        <Separator />

        {/* Broadcast History */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold">
            {t("official.broadcast.history")}
          </h2>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("official.broadcast.loading")}
            </p>
          ) : broadcasts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("official.broadcast.empty")}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {broadcasts.map((b) => (
                <div
                  key={b.id}
                  className="rounded-lg border border-border bg-card p-4 space-y-3"
                >
                  {/* Top row: content preview + status */}
                  <div className="flex items-start gap-3">
                    <Radio className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="flex-1 text-sm line-clamp-2">{b.content}</p>
                    {statusBadge(b.status)}
                  </div>

                  {/* Stats row */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {t("official.broadcast.recipients", {
                        count: b.totalRecipients,
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3.5 w-3.5" />
                      {t("official.broadcast.delivered", {
                        count: b.deliveredCount,
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      {t("official.broadcast.read", { count: b.readCount })}
                    </span>
                    {b.scheduledAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(b.scheduledAt).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {(b.status === "draft" || b.status === "scheduled") && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleSendExisting(b.id)}
                      >
                        <Send className="mr-1 h-3.5 w-3.5" />
                        {t("official.broadcast.sendNow")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(b.id)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {t("official.broadcast.delete")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
