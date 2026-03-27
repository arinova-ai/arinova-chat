"use client";

import { useEffect, useState } from "react";
import { Activity, ChevronDown, ChevronRight, Clock, DollarSign, RotateCw } from "lucide-react";

interface TaskEntry {
  id: string;
  agentId: string;
  status: "started" | "completed";
  task?: string;
  durationMs?: number;
  costUsd?: number;
  numTurns?: number;
  timestamp: number;
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

  // Listen for task_update events
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (data?.type === "task_update" && data.agentId) {
        const entry: TaskEntry = {
          id: `${data.agentId}-${Date.now()}`,
          agentId: data.agentId,
          status: data.status ?? "started",
          task: data.task,
          durationMs: data.durationMs,
          costUsd: data.costUsd,
          numTurns: data.numTurns,
          timestamp: Date.now(),
        };
        setTasks((prev) => [entry, ...prev].slice(0, 100)); // Keep last 100
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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-2.5 flex items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Task Activity</span>
        <span className="text-xs text-muted-foreground">({tasks.length})</span>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-4">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/15">
              <Activity className="h-7 w-7 text-blue-400" />
            </div>
            <p className="text-sm text-muted-foreground">No task activity yet</p>
            <p className="text-xs text-muted-foreground/60">Tasks will appear here when agents start working</p>
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
                    onClick={() => isCompleted && toggleExpand(t.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
                  >
                    <span className="text-base shrink-0">
                      {isCompleted ? "✅" : "⏳"}
                    </span>
                    {isCompleted && (
                      <span className="shrink-0 text-muted-foreground">
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{t.task || "Working..."}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">
                      {relativeTime(t.timestamp)}
                    </span>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && isCompleted && (
                    <div className="ml-12 mb-2 flex gap-4 text-xs text-muted-foreground">
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
