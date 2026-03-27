"use client";

import { useEffect, useState } from "react";
import { Activity, ChevronDown, ChevronRight, Clock, DollarSign, RotateCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

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
                status: "completed",
                durationMs: data.durationMs,
                costUsd: data.costUsd,
                numTurns: data.numTurns,
              };
              return updated;
            }
            // No matching started — add as new completed
            return [{
              id: `${data.agentId}-${Date.now()}`,
              agentId: data.agentId,
              status: "completed",
              task: data.task,
              durationMs: data.durationMs,
              costUsd: data.costUsd,
              numTurns: data.numTurns,
              timestamp: Date.now(),
            }, ...prev].slice(0, 100);
          });
        } else {
          // started — add new entry
          setTasks((prev) => [{
            id: `${data.agentId}-${Date.now()}`,
            agentId: data.agentId,
            status: "started",
            task: data.task,
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

  // Mock data for testing (dev only)
  const addMockTask = () => {
    const mockTasks = [
      "Reviewing pull request #42",
      "Running test suite",
      "Deploying to staging",
      "Analyzing code coverage",
      "Building documentation",
    ];
    const task = mockTasks[Math.floor(Math.random() * mockTasks.length)];
    const isCompleted = Math.random() > 0.5;
    setTasks((prev) => [{
      id: `mock-${Date.now()}`,
      agentId: "mock-agent",
      status: isCompleted ? "completed" : "started",
      task,
      durationMs: isCompleted ? Math.floor(Math.random() * 30000) + 1000 : undefined,
      costUsd: isCompleted ? Math.random() * 0.05 : undefined,
      numTurns: isCompleted ? Math.floor(Math.random() * 10) + 1 : undefined,
      timestamp: Date.now(),
    }, ...prev].slice(0, 100));
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-2.5 flex items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Task Activity</span>
        <span className="text-xs text-muted-foreground">({tasks.length})</span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground" onClick={addMockTask}>
          <Plus className="h-3 w-3" />
          Mock
        </Button>
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
                    onClick={() => isCompleted ? toggleExpand(t.id) : undefined}
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
                    {!isCompleted && <span className="w-[14px] shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{t.task || "Working..."}</p>
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
