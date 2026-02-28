"use client";

import { useEffect, useState, useCallback } from "react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, Link2, Link2Off, Bot } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { assetUrl, AGENT_DEFAULT_AVATAR } from "@/lib/config";
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

const BINDINGS_KEY = "office-agent-bindings";

function getBindings(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(BINDINGS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function setBinding(characterId: string, agentId: string | null) {
  const bindings = getBindings();
  if (agentId) {
    bindings[characterId] = agentId;
  } else {
    delete bindings[characterId];
  }
  localStorage.setItem(BINDINGS_KEY, JSON.stringify(bindings));
}

interface CharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: Agent | null;
  agents?: Agent[];
  /** Character identifier for agent binding (defaults to "default") */
  characterId?: string;
}

const OFFLINE_BADGE = { label: "No agent connected", dot: "bg-slate-500", bg: "bg-slate-500/15", text: "text-slate-400" };

function CharacterDetailOffline() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-700/30 text-2xl">
          🤖
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-100">Arinova Assistant</div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${OFFLINE_BADGE.bg} ${OFFLINE_BADGE.text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${OFFLINE_BADGE.dot}`} />
            {OFFLINE_BADGE.label}
          </span>
        </div>
      </div>

      <p className="text-sm text-slate-400">No agent is currently connected to this office.</p>

      <div className="flex gap-2">
        <button
          type="button"
          disabled
          className="flex-1 rounded-lg bg-amber-600/50 px-4 py-2 text-sm font-medium text-white/50 cursor-not-allowed"
        >
          Chat
        </button>
      </div>
    </div>
  );
}

function CharacterDetail({ agent, agents, characterId }: { agent: Agent; agents: Agent[]; characterId: string }) {
  const badge = STATUS_BADGE[agent.status] ?? STATUS_BADGE.idle;
  const chatAgents = useChatStore((s) => s.agents);
  const loadAgents = useChatStore((s) => s.loadAgents);
  const [boundAgentId, setBoundAgentId] = useState<string | null>(() => getBindings()[characterId] ?? null);
  const [bindOpen, setBindOpen] = useState(false);

  const boundChatAgent = boundAgentId ? chatAgents.find((a) => a.id === boundAgentId) : null;

  useEffect(() => {
    if (chatAgents.length === 0) loadAgents();
  }, [chatAgents.length, loadAgents]);

  const handleBind = useCallback((agentId: string) => {
    setBinding(characterId, agentId);
    setBoundAgentId(agentId);
    setBindOpen(false);
  }, [characterId]);

  const handleUnbind = useCallback(() => {
    setBinding(characterId, null);
    setBoundAgentId(null);
  }, [characterId]);

  const displayName = boundChatAgent?.name ?? agent.name;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl"
          style={{ backgroundColor: agent.color }}
        >
          {agent.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-100">{displayName}</span>
            {agent.role && (
              <span className="text-sm text-slate-400">{agent.role}</span>
            )}
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.bg} ${badge.text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>
        </div>
      </div>

      {/* Plugin stats: model, tokens, session, tool */}
      {(agent.model || agent.tokenUsage || agent.sessionDurationMs != null || agent.currentToolDetail) && (
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
        </div>
      )}

      {/* Current Task */}
      {agent.currentTask && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Current Task
          </h3>
          <div className="space-y-2.5 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded bg-yellow-500/15 px-1.5 py-0.5 font-mono text-xs text-yellow-400">
                {agent.currentTask.priority}
              </span>
              <span className="font-medium text-slate-100">{agent.currentTask.title}</span>
            </div>
            <div className="text-xs text-slate-400">
              Due: {agent.currentTask.due} &middot; Assigned by: {agent.currentTask.assignedBy}
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-700">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${agent.currentTask.progress}%` }}
                />
              </div>
              <span className="w-8 text-right text-xs text-slate-400">
                {agent.currentTask.progress}%
              </span>
            </div>

            {/* Subtasks */}
            <div className="space-y-1">
              {agent.currentTask.subtasks.map((st, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={st.done ? "text-green-400" : "text-slate-500"}>
                    {st.done ? "✓" : "○"}
                  </span>
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
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Recent Activity
          </h3>
          <div className="space-y-1.5">
            {agent.recentActivity.map((act, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="w-10 shrink-0 font-mono text-slate-500">{act.time}</span>
                <span className="text-slate-300">{act.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collaborators */}
      {agent.status === "collaborating" && agent.collaboratingWith && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
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

      {/* Bound Agent */}
      {boundChatAgent && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Bound Agent
          </h3>
          <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={boundChatAgent.avatarUrl ? assetUrl(boundChatAgent.avatarUrl) : AGENT_DEFAULT_AVATAR}
                alt={boundChatAgent.name}
                className="object-cover"
              />
              <AvatarFallback className="bg-slate-700 text-slate-300 text-xs">
                <Bot className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-100">{boundChatAgent.name}</div>
              {boundChatAgent.description && (
                <div className="truncate text-xs text-slate-400">{boundChatAgent.description}</div>
              )}
            </div>
            <button
              type="button"
              onClick={handleUnbind}
              className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
              title="Unbind agent"
            >
              <Link2Off className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
        >
          Chat
        </button>
        <Popover open={bindOpen} onOpenChange={setBindOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
              title="Bind to Agent"
            >
              <Link2 className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-64 border-slate-700 bg-slate-900 p-0"
            align="end"
            sideOffset={8}
          >
            <div className="border-b border-slate-700 px-3 py-2">
              <p className="text-xs font-semibold text-slate-300">Bind to Agent</p>
            </div>
            <div className="max-h-48 overflow-y-auto py-1">
              {chatAgents.length === 0 && (
                <p className="px-3 py-2 text-xs text-slate-500">No agents available</p>
              )}
              {chatAgents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleBind(a.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-slate-800"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage
                      src={a.avatarUrl ? assetUrl(a.avatarUrl) : AGENT_DEFAULT_AVATAR}
                      alt={a.name}
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-slate-700 text-slate-300 text-[10px]">
                      <Bot className="h-3 w-3" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{a.name}</span>
                  {boundAgentId === a.id && (
                    <Check className="h-4 w-4 shrink-0 text-amber-400" />
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export function CharacterModal({ isOpen, onClose, agent, agents = [], characterId = "default" }: CharacterModalProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const title = agent?.name || "Arinova Assistant";
  const content = agent
    ? <CharacterDetail agent={agent} agents={agents} characterId={characterId} />
    : <CharacterDetailOffline />;

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto rounded-t-2xl border-slate-700 bg-slate-900">
          <SheetHeader>
            <SheetTitle className="text-slate-100">{title}</SheetTitle>
            <SheetDescription className="sr-only">Character details</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {content}
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
        {content}
      </DialogContent>
    </Dialog>
  );
}
