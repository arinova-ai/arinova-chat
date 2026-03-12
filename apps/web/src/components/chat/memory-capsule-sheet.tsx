"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Brain,
  Loader2,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";

interface CapsuleProgress {
  totalMessages: number;
  processedMessages: number;
  totalNotes: number;
  processedNotes: number;
  extractedEntries: number;
}

interface Capsule {
  id: string;
  name: string;
  sourceConversationId: string | null;
  messageCount: number;
  status: string;
  createdAt: string;
  extractedThrough: string | null;
  entryCount: number;
  noteCount: number;
  progress: CapsuleProgress | null;
}

interface Grant {
  capsuleId: string;
  capsuleName: string;
  createdAt: string;
}

interface MemoryCapsuleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  conversationName: string;
  agentId: string;
}

export function MemoryCapsuleSheet({
  open,
  onOpenChange,
  conversationId,
  conversationName,
  agentId,
}: MemoryCapsuleSheetProps) {
  const { t } = useTranslation();
  const [capsuleName, setCapsuleName] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [capsules, setCapsules] = useState<Capsule[]>([]);
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [capsuleRes, grantRes] = await Promise.all([
        api<{ capsules: Capsule[] }>("/api/memory/capsules", { silent: true }),
        api<{ grants: Grant[] }>(
          `/api/memory/capsules/grants?agent_id=${agentId}`,
          { silent: true }
        ),
      ]);
      setCapsules(capsuleRes.capsules);
      setGrants(new Set(grantRes.grants.map((g) => g.capsuleId)));
    } catch {
      // api() shows toast on error unless silent
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    if (open) {
      setCapsuleName(conversationName);
      fetchData();
    }
  }, [open, conversationName, fetchData]);

  // Auto-refresh while any capsule is extracting
  useEffect(() => {
    const hasExtracting = capsules.some((c) => c.status === "extracting");
    if (!hasExtracting || !open) return;
    const interval = setInterval(() => {
      fetchData();
    }, 5000);
    return () => clearInterval(interval);
  }, [capsules, open, fetchData]);

  const handleExtract = async () => {
    if (!capsuleName.trim()) return;
    setExtracting(true);
    try {
      await api("/api/memory/capsules", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: conversationId,
          name: capsuleName.trim(),
        }),
      });
      setCapsuleName("");
      await fetchData();
    } catch (err: unknown) {
      // 409 = capsule already exists for this conversation — auto-refresh it
      if (err instanceof ApiError && err.status === 409) {
        const existingId = err.data.existingCapsuleId as string | undefined;
        if (existingId) {
          try {
            await api(`/api/memory/capsules/${existingId}/refresh`, { method: "POST" });
          } catch { /* toast shown by api */ }
        }
        await fetchData();
      }
    } finally {
      setExtracting(false);
    }
  };

  const handleToggleGrant = async (capsuleId: string, granted: boolean) => {
    setTogglingId(capsuleId);
    try {
      if (granted) {
        await api(`/api/memory/capsules/${capsuleId}/grants/${agentId}`, {
          method: "DELETE",
        });
        setGrants((prev) => {
          const next = new Set(prev);
          next.delete(capsuleId);
          return next;
        });
      } else {
        await api(`/api/memory/capsules/${capsuleId}/grants`, {
          method: "POST",
          body: JSON.stringify({ agent_id: agentId }),
        });
        setGrants((prev) => new Set(prev).add(capsuleId));
      }
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (capsuleId: string) => {
    setDeletingId(capsuleId);
    try {
      await api(`/api/memory/capsules/${capsuleId}`, { method: "DELETE" });
      setCapsules((prev) => prev.filter((c) => c.id !== capsuleId));
      setGrants((prev) => {
        const next = new Set(prev);
        next.delete(capsuleId);
        return next;
      });
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const handleAbort = async (capsuleId: string) => {
    try {
      await api(`/api/memory/capsules/${capsuleId}/abort`, { method: "POST" });
      await fetchData();
    } catch { /* api shows toast */ }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="rounded-t-2xl border-border bg-secondary px-4 pb-6 pt-3 max-h-[80vh] overflow-y-auto"
      >
        <VisuallyHidden.Root>
          <SheetTitle>{t("memoryCapsule.title")}</SheetTitle>
        </VisuallyHidden.Root>

        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted" />

        {/* Title */}
        <div className="mb-4 flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">{t("memoryCapsule.title")}</h2>
        </div>

        {/* Section 1: Extract Memory */}
        {(() => {
          const existingCapsule = capsules.find(
            (c) => c.sourceConversationId === conversationId
          );
          const isRefresh = !!existingCapsule;
          return (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                {t("memoryCapsule.extractTitle")}
              </h3>
              {isRefresh ? (
                <Button
                  onClick={async () => {
                    setExtracting(true);
                    try {
                      await api(`/api/memory/capsules/${existingCapsule.id}/refresh`, { method: "POST" });
                      await fetchData();
                    } catch { /* api shows toast */ }
                    setExtracting(false);
                  }}
                  disabled={extracting || existingCapsule.status === "extracting"}
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                >
                  {extracting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Refresh
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={capsuleName}
                    onChange={(e) => setCapsuleName(e.target.value)}
                    placeholder={t("memoryCapsule.namePlaceholder")}
                    className="flex-1"
                    maxLength={255}
                  />
                  <Button
                    onClick={handleExtract}
                    disabled={extracting || !capsuleName.trim()}
                    size="sm"
                  >
                    {extracting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t("memoryCapsule.extract")
                    )}
                  </Button>
                </div>
              )}
            </div>
          );
        })()}

        {/* Section 2: Capsule List with Agent Grants */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            {t("memoryCapsule.approveTitle")}
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : capsules.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("memoryCapsule.empty")}
            </p>
          ) : (
            <div className="space-y-1">
              {capsules.map((capsule) => {
                const granted = grants.has(capsule.id);
                const isToggling = togglingId === capsule.id;
                const isDeleting = deletingId === capsule.id;
                const isConfirming = confirmDeleteId === capsule.id;

                return (
                  <div
                    key={capsule.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/40"
                  >
                    <Switch
                      checked={granted}
                      disabled={isToggling || capsule.status !== "ready"}
                      onCheckedChange={() =>
                        handleToggleGrant(capsule.id, granted)
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {capsule.name}
                      </p>
                      {capsule.status === "extracting" ? (
                        <div className="space-y-1">
                          {capsule.progress ? (
                            <>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-primary transition-all duration-500"
                                  style={{
                                    width: `${capsule.progress.totalMessages > 0
                                      ? Math.round((capsule.progress.processedMessages / capsule.progress.totalMessages) * 100)
                                      : 0}%`,
                                  }}
                                />
                              </div>
                              <p className="text-[10px] text-muted-foreground">
                                {capsule.progress.processedMessages} / {capsule.progress.totalMessages} messages
                                {capsule.progress.totalNotes > 0 && `, ${capsule.progress.processedNotes} / ${capsule.progress.totalNotes} notes`}
                              </p>
                              {capsule.progress.extractedEntries > 0 && (
                                <p className="text-[10px] text-muted-foreground">
                                  {capsule.progress.extractedEntries} entries extracted
                                </p>
                              )}
                            </>
                          ) : (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span>{t("memoryCapsule.statusExtracting")}</span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => handleAbort(capsule.id)}
                            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-destructive hover:bg-destructive/10"
                          >
                            <XCircle className="h-3 w-3" />
                            Cancel
                          </button>
                        </div>
                      ) : capsule.status === "failed" ? (
                        <p className="text-xs text-destructive">
                          {t("memoryCapsule.statusFailed")}
                        </p>
                      ) : (
                        <div className="space-y-0.5">
                          <p className="text-xs text-muted-foreground">
                            {capsule.entryCount > 0
                              ? `${capsule.entryCount} ${t("memoryCapsule.entries")} · ${capsule.messageCount} ${t("memoryCapsule.messages")}${capsule.noteCount > 0 ? ` · ${capsule.noteCount} notes` : ""}`
                              : `${capsule.messageCount} ${t("memoryCapsule.messages")}${capsule.noteCount > 0 ? ` · ${capsule.noteCount} notes` : ""}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(capsule.createdAt).toLocaleDateString()}
                            {capsule.extractedThrough
                              ? ` ~ ${new Date(capsule.extractedThrough).toLocaleDateString()}`
                              : ` · ${t("memoryCapsule.notExtracted")}`}
                          </p>
                        </div>
                      )}
                    </div>
                    {isConfirming ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={isDeleting}
                          onClick={() => handleDelete(capsule.id)}
                        >
                          {isDeleting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            t("common.confirm")
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          {t("common.cancel")}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={capsule.status === "extracting"}
                        onClick={() => setConfirmDeleteId(capsule.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
