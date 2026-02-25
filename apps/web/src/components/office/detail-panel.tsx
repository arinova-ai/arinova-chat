"use client";

import type { Agent, AgentStatus } from "./types";

const STATUS_BADGE: Record<AgentStatus, { label: string; bg: string; text: string }> = {
  working: { label: "🟢 Working", bg: "bg-green-500/20", text: "text-green-400" },
  idle: { label: "🟡 Idle", bg: "bg-yellow-500/20", text: "text-yellow-400" },
  blocked: { label: "🔴 Blocked", bg: "bg-red-500/20", text: "text-red-400" },
  collaborating: { label: "🔵 Collaborating", bg: "bg-blue-500/20", text: "text-blue-400" },
};

interface Props {
  agent: Agent;
  agents: Agent[];
  onClose: () => void;
}

export default function DetailPanel({ agent, agents, onClose }: Props) {
  const badge = STATUS_BADGE[agent.status];

  return (
    <div className="bg-slate-800 border-t border-slate-700 overflow-y-auto animate-slideUp">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-700">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: agent.color }}
        >
          {agent.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">{agent.name}</span>
            <span className="text-slate-400 text-sm">{agent.role}</span>
          </div>
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-xl px-2 cursor-pointer"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="px-5 py-3 space-y-4">
        {/* Current Task */}
        {agent.currentTask && (
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              📌 Current Task
            </h3>
            <div className="bg-slate-900 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-yellow-400 font-mono text-xs">[{agent.currentTask.priority}]</span>
                <span className="text-white font-medium">{agent.currentTask.title}</span>
              </div>
              <div className="text-xs text-slate-400">
                Due: {agent.currentTask.due} | Assigned by: {agent.currentTask.assignedBy}
              </div>

              {/* Progress bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${agent.currentTask.progress}%` }}
                  />
                </div>
                <span className="text-xs text-slate-400 w-8 text-right">
                  {agent.currentTask.progress}%
                </span>
              </div>

              {/* Subtasks */}
              <div className="space-y-1 mt-1">
                {agent.currentTask.subtasks.map((st, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span>{st.done ? "✅" : "⬜"}</span>
                    <span className={st.done ? "text-slate-500 line-through" : "text-slate-300"}>
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
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              📝 Recent Activity
            </h3>
            <div className="space-y-1">
              {agent.recentActivity.map((act, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 font-mono w-10 shrink-0">{act.time}</span>
                  <span className="text-slate-300">{act.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collaborators */}
        {agent.status === "collaborating" && agent.collaboratingWith && (
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              🤝 Collaborators
            </h3>
            <p className="text-sm text-slate-300">
              Working with:{" "}
              {agent.collaboratingWith
                .map((id) => agents.find((a) => a.id === id)?.name ?? id)
                .join(", ")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
