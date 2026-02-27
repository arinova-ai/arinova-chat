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
import type { Agent } from "./types";

const STATUS_BADGE: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  working: { label: "Working", dot: "bg-green-400", bg: "bg-green-500/15", text: "text-green-400" },
  idle: { label: "Idle", dot: "bg-yellow-400", bg: "bg-yellow-500/15", text: "text-yellow-400" },
  blocked: { label: "Blocked", dot: "bg-red-400", bg: "bg-red-500/15", text: "text-red-400" },
  collaborating: { label: "Collaborating", dot: "bg-blue-400", bg: "bg-blue-500/15", text: "text-blue-400" },
  sleeping: { label: "Sleeping", dot: "bg-purple-400", bg: "bg-purple-500/15", text: "text-purple-400" },
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface CharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: Agent | null;
}

function CharacterDetail({ agent }: { agent: Agent }) {
  const badge = STATUS_BADGE[agent.status] ?? STATUS_BADGE.idle;

  return (
    <div className="space-y-5">
      {/* Character header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-700/30 text-2xl">
          {agent.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-100">{agent.name}</div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.bg} ${badge.text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>
        </div>
      </div>

      {/* Info grid */}
      <div className="space-y-2.5">
        {agent.model && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Model</span>
            <span className="text-slate-200 font-mono text-xs">{agent.model}</span>
          </div>
        )}

        {agent.tokenUsage && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Tokens</span>
            <span className="text-slate-200 text-xs">
              {formatTokens(agent.tokenUsage.input)} in / {formatTokens(agent.tokenUsage.output)} out
            </span>
          </div>
        )}

        {agent.sessionDurationMs != null && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Session</span>
            <span className="text-slate-200 text-xs">{formatDuration(agent.sessionDurationMs)}</span>
          </div>
        )}

        {agent.currentToolDetail && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Tool</span>
            <span className="text-slate-200 font-mono text-xs truncate ml-2">{agent.currentToolDetail}</span>
          </div>
        )}

        {agent.currentTask && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Task</span>
            <span className="text-slate-200 text-xs truncate ml-2">{agent.currentTask.title}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
        >
          Chat
        </button>
      </div>
    </div>
  );
}

export function CharacterModal({ isOpen, onClose, agent }: CharacterModalProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (!agent) return null;

  const title = agent.name || "Agent";

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto rounded-t-2xl border-slate-700 bg-slate-900">
          <SheetHeader>
            <SheetTitle className="text-slate-100">{title}</SheetTitle>
            <SheetDescription className="sr-only">Character details</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <CharacterDetail agent={agent} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm border-slate-700 bg-slate-900">
        <DialogHeader>
          <DialogTitle className="text-slate-100">{title}</DialogTitle>
          <DialogDescription className="sr-only">Character details</DialogDescription>
        </DialogHeader>
        <CharacterDetail agent={agent} />
      </DialogContent>
    </Dialog>
  );
}
