"use client";

import { useEffect, useState } from "react";
import { Activity, ChevronDown, ChevronRight, Clock, DollarSign, RotateCw } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";

interface TaskEntry {
  id: string;
  agentId: string;
  agentName?: string;
  status: "started" | "completed";
  task?: string;
  durationMs?: number;
  costUsd?: number;
  numTurns?: number;
  timestamp: number;
}

interface ActivityLogItem {
  id: string;
  agentId: string;
  agentName: string | null;
  activityType: string;
  title: string;
  detail: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export default function OfficeActivityPage() {
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Load history from API on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await api<{ items: ActivityLogItem[]; nextCursor?: string }>(
          "/api/office/activity?limit=50",
          { silent: true },
        );
        if (data?.items?.length) {
          const history: TaskEntry[] = data.items.map((item) => ({
            id: item.id,
            agentId: item.agentId,
            agentName: item.agentName ?? undefined,
            status: item.activityType === "task_completed" ? "completed" as const : "started" as const,
            task: item.title,
            durationMs: undefined,
            costUsd: undefined,
            numTurns: undefined,
            timestamp: new Date(item.createdAt).getTime(),
          }));
          // Parse detail for completed tasks (e.g. "123ms · $0.0012 · 5 turns")
          for (const entry of history) {
            const item = data.items.find((i) => i.id === entry.id);
            if (item?.detail) {
              const dMatch = item.detail.match(/(\d+)ms/);
              const cMatch = item.detail.match(/\$([0-9.]+)/);
              const tMatch = item.detail.match(/(\d+) turns/);
              if (dMatch) entry.durationMs = parseInt(dMatch[1]);
              if (cMatch) entry.costUsd = parseFloat(cMatch[1]);
              if (tMatch) entry.numTurns = parseInt(tMatch[1]);
            }
          }
          setTasks(history);
        }
      } catch { /* API may not be available yet */ }
    })();
  }, []);

  // Listen for task_update events
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (data?.type === "task_update" && data.agentId) {
        if (data.status === "completed") {
          // Update existing started entry to completed
          setTasks((prev) => {
            const idx = prev.findIndex(
              (t) => t.agentId === data.agentId && t.status === "started" && t.task === data.task
            );
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = {
                ...updated[idx],
                status: "completed" as const,
                durationMs: data.durationMs as number | undefined,
                costUsd: data.costUsd as number | undefined,
                numTurns: data.numTurns as number | undefined,
              };
              return updated;
            }
            // No matching started — add as new completed
            return [{
              id: `${data.agentId}-${Date.now()}` as string,
              agentId: data.agentId as string,
              agentName: data.agentName as string | undefined,
              status: "completed" as const,
              task: data.task as string | undefined,
              durationMs: data.durationMs as number | undefined,
              costUsd: data.costUsd as number | undefined,
              numTurns: data.numTurns as number | undefined,
              timestamp: Date.now(),
            }, ...prev].slice(0, 100);
          });
        } else {
          // started — add new entry
          setTasks((prev) => [{
            id: `${data.agentId}-${Date.now()}` as string,
            agentId: data.agentId as string,
            agentName: data.agentName as string | undefined,
            status: "started" as const,
            task: data.task as string | undefined,
            timestamp: Date.now(),
          }, ...prev].slice(0, 100));
        }
      }
    };
    window.addEventListener("ws-task-update", handler);
    return () => window.removeEventListener("ws-task-update", handler);
  }, []);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-2.5 flex items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t("office.activity.title")}</span>
        <span className="text-xs text-muted-foreground">({tasks.length})</span>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-4">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/15">
              <Activity className="h-7 w-7 text-blue-400" />
            </div>
            <p className="text-sm text-muted-foreground">{t("office.activity.empty")}</p>
            <p className="text-xs text-muted-foreground/60">{t("office.activity.emptyHint")}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {tasks.map((t) => {
              const isExpanded = expanded.has(t.id);
              const isCompleted = t.status === "completed";
              return (
                <div key={t.id}>
                  {/* Collapsed row */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(t.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
                  >
                    <span className="text-base shrink-0">
                      {isCompleted ? "✅" : "⏳"}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${isExpanded ? "whitespace-pre-wrap break-words" : "truncate"}`}>{t.task || "Working..."}</p>
                      {t.agentName && (
                        <p className="text-[10px] text-muted-foreground/60 truncate">{t.agentName}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">
                      {relativeTime(t.timestamp)}
                    </span>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && isCompleted && (
                    <div className="ml-12 mb-2 flex gap-4 text-xs text-muted-foreground bg-muted/20 rounded-lg px-3 py-2">
                      {t.durationMs != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(t.durationMs)}
                        </span>
                      )}
                      {t.costUsd != null && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          ${t.costUsd.toFixed(4)}
                        </span>
                      )}
                      {t.numTurns != null && (
                        <span className="flex items-center gap-1">
                          <RotateCw className="h-3 w-3" />
                          {t.numTurns} turns
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
