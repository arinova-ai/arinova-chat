"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  Brain,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Search,
  X,
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

interface MemoryEntry {
  id: string;
  content: string;
  importance: number;
  tags: string[];
  sourceStart: string | null;
  sourceEnd: string | null;
  createdAt: string;
  score?: number;
}

function importanceColor(importance: number) {
  if (importance >= 0.8) return "text-red-400 bg-red-500/15";
  if (importance >= 0.5) return "text-yellow-400 bg-yellow-500/15";
  return "text-muted-foreground bg-muted";
}

function CapsuleDetailView({
  capsule,
  onBack,
}: {
  capsule: Capsule;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const perPage = 20;

  const fetchEntries = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await api<{ entries: MemoryEntry[]; total: number }>(
        `/api/memory/capsules/${capsule.id}/entries?page=${p}&per_page=${perPage}`,
        { silent: true },
      );
      setEntries(res.entries);
      setTotal(res.total);
      setPage(p);
    } catch { /* ignore */ }
    setLoading(false);
  }, [capsule.id]);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      fetchEntries(1);
      return;
    }
    setSearching(true);
    try {
      const res = await api<{ entries: MemoryEntry[]; total: number }>(
        `/api/memory/capsules/${capsule.id}/entries/search?query=${encodeURIComponent(query.trim())}&limit=50`,
        { silent: true },
      );
      setEntries(res.entries);
      setTotal(res.total);
    } catch { /* ignore */ }
    setSearching(false);
  }, [capsule.id, fetchEntries]);

  useEffect(() => {
    fetchEntries(1);
  }, [fetchEntries]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold truncate">{capsule.name}</h3>
          <p className="text-xs text-muted-foreground">
            {capsule.entryCount} {t("memoryCapsule.entries")} · {capsule.messageCount} {t("memoryCapsule.messages")}
            {capsule.noteCount > 0 && ` · ${capsule.noteCount} ${t("memoryCapsule.notes")}`}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(searchQuery); }}
          placeholder={t("memoryCapsule.searchEntries")}
          className="h-8 pl-8 pr-8 text-xs"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => { setSearchQuery(""); fetchEntries(1); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Entry list */}
      {loading || searching ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("memoryCapsule.noEntries")}
        </p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry) => {
            const isExpanded = expandedId === entry.id;
            const colorClass = importanceColor(entry.importance);
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                className="w-full text-left rounded-lg border border-border px-3 py-2 hover:bg-accent/40 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <span className={`shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${colorClass}`}>
                    {(entry.importance * 100).toFixed(0)}%
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs ${isExpanded ? "" : "line-clamp-2"}`}>
                      {entry.content}
                    </p>
                    {/* Tags */}
                    {entry.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {entry.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Time range */}
                    {(entry.sourceStart || entry.sourceEnd) && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {entry.sourceStart ? new Date(entry.sourceStart).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                        {entry.sourceStart && entry.sourceEnd ? " ~ " : ""}
                        {entry.sourceEnd ? new Date(entry.sourceEnd).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                      </p>
                    )}
                    {/* Score for search results */}
                    {entry.score !== undefined && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {t("memoryCapsule.relevance")}: {(entry.score * 100).toFixed(0)}%
                      </p>
                    )}
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground mt-0.5" />
                  ) : (
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground mt-0.5" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!searchQuery && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={page <= 1 || loading}
            onClick={() => fetchEntries(page - 1)}
          >
            ←
          </Button>
          <span className="text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={page >= totalPages || loading}
            onClick={() => fetchEntries(page + 1)}
          >
            →
          </Button>
        </div>
      )}
    </div>
  );
}

interface MemoryCapsuleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  conversationName: string;
  agentId: string;
  inline?: boolean;
}

export function MemoryCapsuleSheet({
  open,
  onOpenChange,
  conversationId,
  conversationName,
  agentId,
  inline,
}: MemoryCapsuleSheetProps) {
  const { t } = useTranslation();
  const [capsuleName, setCapsuleName] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [capsules, setCapsules] = useState<Capsule[]>([]);
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [selectedCapsule, setSelectedCapsule] = useState<Capsule | null>(null);

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
    } else {
      setSelectedCapsule(null);
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


  const content = (
    <>
      {selectedCapsule ? (
        <CapsuleDetailView
          capsule={selectedCapsule}
          onBack={() => setSelectedCapsule(null)}
        />
      ) : (
      <>
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
                    <button
                      type="button"
                      className="truncate text-sm font-medium hover:underline text-left"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (capsule.status === "ready") setSelectedCapsule(capsule);
                      }}
                    >
                      {capsule.name}
                    </button>
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
                              {capsule.progress.totalNotes > 0 && `, ${capsule.progress.processedNotes} / ${capsule.progress.totalNotes} ${t("memoryCapsule.notes")}`}
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
                      </div>
                    ) : capsule.status === "failed" ? (
                      <p className="text-xs text-destructive">
                        {t("memoryCapsule.statusFailed")}
                      </p>
                    ) : (
                      <div className="space-y-0.5">
                        <p className="text-xs text-muted-foreground">
                          {capsule.entryCount > 0
                            ? `${capsule.entryCount} ${t("memoryCapsule.entries")} · ${capsule.messageCount} ${t("memoryCapsule.messages")}${capsule.noteCount > 0 ? ` · ${capsule.noteCount} ${t("memoryCapsule.notes")}` : ""}`
                            : `${capsule.messageCount} ${t("memoryCapsule.messages")}${capsule.noteCount > 0 ? ` · ${capsule.noteCount} ${t("memoryCapsule.notes")}` : ""}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(capsule.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          {capsule.extractedThrough
                            ? ` ~ ${new Date(capsule.extractedThrough).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                            : ` · ${t("memoryCapsule.notExtracted")}`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}
    </>
  );

  if (inline) {
    return <div className="p-4">{content}</div>;
  }

  if (!open) return null;

  // Mobile: full-screen overlay like kanban-sidebar
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-brand" />
          <h2 className="text-base font-semibold">{t("memoryCapsule.title")}</h2>
        </div>
        <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg p-1 hover:bg-accent">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {content}
      </div>
    </div>,
    document.body,
  );
}
