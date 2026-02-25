"use client";

import type { Agent, AgentStatus } from "./types";

const STATUS_INFO: Record<AgentStatus, { label: string; dot: string; color: string }> = {
  working: { label: "Working", dot: "🟢", color: "text-green-400" },
  idle: { label: "Idle", dot: "🟡", color: "text-yellow-400" },
  blocked: { label: "Blocked", dot: "🔴", color: "text-red-400" },
  collaborating: { label: "Collab", dot: "🔵", color: "text-blue-400" },
};

interface Props {
  agents: Agent[];
}

export default function StatusBar({ agents }: Props) {
  const counts: Record<AgentStatus, number> = {
    working: 0,
    idle: 0,
    blocked: 0,
    collaborating: 0,
  };
  for (const a of agents) {
    counts[a.status]++;
  }

  return (
    <div className="flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-2 bg-slate-800/50 rounded-lg text-xs sm:text-sm overflow-x-auto">
      {(Object.entries(STATUS_INFO) as [AgentStatus, (typeof STATUS_INFO)[AgentStatus]][]).map(
        ([status, info]) => (
          <span key={status} className={`flex shrink-0 items-center gap-1 ${info.color}`}>
            <span>{info.dot}</span>
            <span className="font-medium">{info.label}:</span>
            <span>{counts[status]}</span>
          </span>
        ),
      )}
    </div>
  );
}
