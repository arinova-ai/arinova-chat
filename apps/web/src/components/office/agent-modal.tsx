"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { Agent, AgentStatus } from "./types";

const STATUS_BADGE: Record<AgentStatus, { label: string; bg: string; text: string }> = {
  working: { label: "Working", bg: "bg-green-500/15", text: "text-green-400" },
  idle: { label: "Idle", bg: "bg-yellow-500/15", text: "text-yellow-400" },
  blocked: { label: "Blocked", bg: "bg-red-500/15", text: "text-red-400" },
  collaborating: { label: "Collaborating", bg: "bg-blue-500/15", text: "text-blue-400" },
};

const STATUS_DOT: Record<AgentStatus, string> = {
  working: "bg-green-400",
  idle: "bg-yellow-400",
  blocked: "bg-red-400",
  collaborating: "bg-blue-400",
};

interface Props {
  agent: Agent | null;
  agents: Agent[];
  onClose: () => void;
}

function AgentDetail({ agent, agents }: { agent: Agent; agents: Agent[] }) {
  const badge = STATUS_BADGE[agent.status];
  const dot = STATUS_DOT[agent.status];

  return (
    <div className="space-y-5">
      {/* Agent header */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl"
          style={{ backgroundColor: agent.color }}
        >
          {agent.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{agent.name}</span>
            <span className="text-sm text-muted-foreground">{agent.role}</span>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.bg} ${badge.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            {badge.label}
          </span>
        </div>
      </div>

      {/* Current Task */}
      {agent.currentTask && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Current Task
          </h3>
          <div className="space-y-2.5 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded bg-yellow-500/15 px-1.5 py-0.5 font-mono text-xs text-yellow-400">
                {agent.currentTask.priority}
              </span>
              <span className="font-medium">{agent.currentTask.title}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Due: {agent.currentTask.due} &middot; Assigned by: {agent.currentTask.assignedBy}
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-brand-accent transition-all duration-300"
                  style={{ width: `${agent.currentTask.progress}%` }}
                />
              </div>
              <span className="w-8 text-right text-xs text-muted-foreground">
                {agent.currentTask.progress}%
              </span>
            </div>

            {/* Subtasks */}
            <div className="space-y-1">
              {agent.currentTask.subtasks.map((st, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={st.done ? "text-green-400" : "text-muted-foreground"}>
                    {st.done ? "✓" : "○"}
                  </span>
                  <span className={st.done ? "text-muted-foreground line-through" : ""}>
                    {st.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {agent.recentActivity.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent Activity
          </h3>
          <div className="space-y-1.5">
            {agent.recentActivity.map((act, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="w-10 shrink-0 font-mono text-muted-foreground">{act.time}</span>
                <span>{act.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collaborators */}
      {agent.status === "collaborating" && agent.collaboratingWith && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Collaborators
          </h3>
          <div className="flex flex-wrap gap-2">
            {agent.collaboratingWith.map((id) => {
              const partner = agents.find((a) => a.id === id);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs text-blue-400"
                >
                  {partner?.emoji ?? "🤖"} {partner?.name ?? id}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function AgentModal({ agent, agents, onClose }: Props) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const open = agent !== null;

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{agent?.name ?? ""}</SheetTitle>
            <SheetDescription className="sr-only">Agent details</SheetDescription>
          </SheetHeader>
          {agent && <div className="px-4 pb-6"><AgentDetail agent={agent} agents={agents} /></div>}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{agent?.name ?? ""}</DialogTitle>
          <DialogDescription className="sr-only">Agent details</DialogDescription>
        </DialogHeader>
        {agent && <AgentDetail agent={agent} agents={agents} />}
      </DialogContent>
    </Dialog>
  );
}
