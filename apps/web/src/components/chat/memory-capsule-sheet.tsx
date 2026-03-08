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
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";

interface Capsule {
  id: string;
  name: string;
  sourceConversationId: string | null;
  messageCount: number;
  status: string;
  createdAt: string;
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
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            {t("memoryCapsule.extractTitle")}
          </h3>
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
        </div>

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
                      disabled={isToggling}
                      onCheckedChange={() =>
                        handleToggleGrant(capsule.id, granted)
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {capsule.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(capsule.createdAt).toLocaleDateString()}
                      </p>
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
