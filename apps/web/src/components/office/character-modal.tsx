"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
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
import { useRouter } from "next/navigation";
import { useChatStore } from "@/store/chat-store";
import { assetUrl, AGENT_DEFAULT_AVATAR } from "@/lib/config";
import { api } from "@/lib/api";
import { getThemeBaseUrl } from "./theme-loader";
import type { Agent } from "./types";
import type { ThemeManifest } from "./theme-types";

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

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200 max-w-[60%] text-right">
        {value ?? <span className="text-slate-500">—</span>}
      </span>
    </div>
  );
}

/** Full-screen AVG visual novel overlay — bg + character tachie + dialog box */
function AvgOverlay({
  isOpen, onClose, themeId, manifest, slotIndex, agent, agents, boundAgentId, onBindingChange, onOpenChat,
}: {
  isOpen: boolean; onClose: () => void;
  themeId: string; manifest: ThemeManifest; slotIndex: number;
  agent: Agent | null; agents: Agent[];
  boundAgentId?: string | null; onBindingChange?: () => void; onOpenChat?: (agentId: string) => void;
}) {
  const [themeBase, setThemeBase] = useState("");
  useEffect(() => {
    getThemeBaseUrl(themeId).then(setThemeBase);
  }, [themeId]);

  if (!isOpen) return null;

  const charDef = manifest.avgCharacters?.find((c) => c.slotIndex === slotIndex);
  const bgImage = manifest.canvas?.background?.image;
  const sprites = charDef
    ? (charDef.sprites.idle ?? charDef.sprites.sleeping ?? Object.values(charDef.sprites)[0])
    : null;

  const isUuidName = agent?.name && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(agent.name);
  const title = (!agent?.name || isUuidName) ? (charDef?.name ?? "Character") : agent.name;
  const badge = agent ? (STATUS_BADGE[agent.status] ?? STATUS_BADGE.idle) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
      {/* Background scene */}
      {themeBase && bgImage && (
        <img
          src={`${themeBase}/${bgImage}`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      )}
      <div className="absolute inset-0 bg-black/30" />

      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/70"
      >
        ✕
      </button>

      {/* Character sprite — full height, centered */}
      {themeBase && sprites && charDef && (
        <div className="relative flex-1 min-h-0 flex items-end justify-center overflow-hidden pointer-events-none">
          <CharacterTachie themeBase={themeBase} sprite={sprites[0]} hotspot={charDef.hotspot} />
        </div>
      )}

      {/* Dialog box at bottom */}
      <div
        className="relative z-10 mx-3 mb-3 rounded-xl border border-white/10 bg-slate-900/85 px-5 py-4 backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Name label */}
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded bg-emerald-600/80 px-2 py-0.5 text-xs font-bold text-white">{title}</span>
          {badge && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.bg} ${badge.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
              {badge.label}
            </span>
          )}
        </div>

        {/* Agent info content */}
        {agent ? (
          <div className="space-y-1.5 text-sm text-slate-300">
            {agent.currentTask && <p>{agent.currentTask.title}</p>}
            {agent.model && <p className="text-xs text-slate-400">Model: <span className="font-mono">{agent.model}</span></p>}
            {agent.tokenUsage && (
              <p className="text-xs text-slate-400">
                Tokens: {formatTokens(agent.tokenUsage.input)} in / {formatTokens(agent.tokenUsage.output)} out
              </p>
            )}
            {agent.recentActivity.length > 0 && (
              <p className="text-xs text-slate-400">{agent.recentActivity[0].text}</p>
            )}
            {!agent.currentTask && !agent.model && agent.recentActivity.length === 0 && (
              <p className="text-slate-400">Waiting for activity...</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No agent connected to this slot.</p>
        )}

        {/* Action buttons */}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={!boundAgentId}
            onClick={() => { if (boundAgentId && onOpenChat) onOpenChat(boundAgentId); }}
            className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Chat
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
            title="Bind to Agent"
          >
            <Link2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Renders the character tachie (standing illustration) from the full-scene sprite */
function CharacterTachie({ themeBase, sprite, hotspot }: { themeBase: string; sprite: string; hotspot: { left: number; top: number; width: number; height: number } }) {
  const [imgRatio, setImgRatio] = useState(0);
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    if (el) {
      const rect = el.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
    }
  }, []);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  const { left, top, width, height } = hotspot;
  const { w: cw, h: ch } = containerSize;

  let imgW = 0, imgH = 0, ox = 0, oy = 0;
  if (imgRatio > 0 && cw > 0 && ch > 0) {
    // Scale to fill container height with the character
    const syFull = ch / (height / 100) * imgRatio;
    imgW = syFull;
    imgH = imgW / imgRatio;
    const hotW = (width / 100) * imgW;
    const hotH = (height / 100) * imgH;
    ox = -(left / 100) * imgW + (cw - hotW) / 2;
    oy = -(top / 100) * imgH + (ch - hotH) / 2;
  }

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <img
        src={`${themeBase}/${sprite}`}
        alt=""
        draggable={false}
        className="absolute max-w-none"
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth && img.naturalHeight) setImgRatio(img.naturalWidth / img.naturalHeight);
        }}
        style={imgRatio > 0 && cw > 0 ? {
          width: imgW,
          height: imgH,
          left: ox,
          top: oy,
        } : { opacity: 0 }}
      />
    </div>
  );
}

interface CharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: Agent | null;
  agents?: Agent[];
  themeId: string;
  slotIndex: number;
  /** Currently bound chat-agent ID (from parent's API state) */
  boundAgentId?: string | null;
  /** Called after bind/unbind so the parent can refetch bindings */
  onBindingChange?: () => void;
  /** Open inline chat panel instead of navigating away */
  onOpenChat?: (agentId: string) => void;
  /** Theme manifest for portrait rendering */
  manifest?: ThemeManifest | null;
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

function CharacterDetail({ agent, agents, themeId, slotIndex, boundAgentId, onBindingChange, onOpenChat }: {
  agent: Agent; agents: Agent[]; themeId: string; slotIndex: number; boundAgentId?: string | null; onBindingChange?: () => void; onOpenChat?: (agentId: string) => void;
}) {
  const badge = STATUS_BADGE[agent.status] ?? STATUS_BADGE.idle;
  const router = useRouter();
  const chatAgents = useChatStore((s) => s.agents);
  const loadAgents = useChatStore((s) => s.loadAgents);
  const createConversation = useChatStore((s) => s.createConversation);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const conversations = useChatStore((s) => s.conversations);
  const [bindOpen, setBindOpen] = useState(false);

  const boundChatAgent = boundAgentId ? chatAgents.find((a) => a.id === boundAgentId) : null;

  useEffect(() => {
    if (chatAgents.length === 0) loadAgents();
  }, [chatAgents.length, loadAgents]);

  const handleBind = useCallback(async (agentId: string) => {
    try {
      await api("/api/office/bindings", {
        method: "PUT",
        body: JSON.stringify({ themeId, slotIndex, agentId }),
      });
      onBindingChange?.();
    } catch { /* api() shows toast */ }
    setBindOpen(false);
  }, [themeId, slotIndex, onBindingChange]);

  const handleUnbind = useCallback(async () => {
    try {
      await api(`/api/office/bindings/${encodeURIComponent(themeId)}/${slotIndex}`, {
        method: "DELETE",
      });
      onBindingChange?.();
    } catch { /* api() shows toast */ }
  }, [themeId, slotIndex, onBindingChange]);

  const handleChat = useCallback(() => {
    if (!boundAgentId) return;
    if (onOpenChat) {
      onOpenChat(boundAgentId);
    } else {
      // Fallback: navigate to chat page
      const existing = conversations.find((c) => c.agentId === boundAgentId && c.type === "direct");
      if (existing) {
        setActiveConversation(existing.id);
      } else {
        createConversation(boundAgentId).then((conv) => {
          setActiveConversation(conv.id);
        });
      }
      router.push("/");
    }
  }, [boundAgentId, onOpenChat, conversations, setActiveConversation, createConversation, router]);

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

      {/* Info fields — always shown */}
      <div className="space-y-2.5">
        <InfoRow label="Model" value={agent.model ? <span className="font-mono text-xs">{agent.model}</span> : null} />
        <InfoRow
          label="Tokens"
          value={agent.tokenUsage ? (
            <span className="text-xs">
              {formatTokens(agent.tokenUsage.input)} in / {formatTokens(agent.tokenUsage.output)} out
              {agent.tokenUsage.cacheRead != null && ` / ${formatTokens(agent.tokenUsage.cacheRead)} cache`}
            </span>
          ) : null}
        />
        <InfoRow
          label="Session"
          value={agent.sessionDurationMs != null ? <span className="text-xs">{formatDuration(agent.sessionDurationMs)}</span> : null}
        />
        <InfoRow
          label="Tool"
          value={agent.currentToolDetail ? <span className="font-mono text-xs truncate">{agent.currentToolDetail}</span> : null}
        />
        <InfoRow
          label="Current Task"
          value={agent.currentTask ? <span className="text-xs">{agent.currentTask.title}</span> : null}
        />
        <InfoRow
          label="Collaborating With"
          value={agent.collaboratingWith && agent.collaboratingWith.length > 0 ? (
            <span className="text-xs">{agent.collaboratingWith.map((id) => {
              const partner = agents.find((a) => a.id === id);
              return partner?.name ?? id;
            }).join(", ")}</span>
          ) : null}
        />
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Recent Activity
        </h3>
        {agent.recentActivity.length > 0 ? (
          <div className="space-y-1.5">
            {agent.recentActivity.map((act, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="w-10 shrink-0 font-mono text-slate-500">{act.time}</span>
                <span className="text-slate-300">{act.text}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">—</p>
        )}
      </div>

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
          disabled={!boundChatAgent}
          onClick={handleChat}
          className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
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

export function CharacterModal({ isOpen, onClose, agent, agents = [], themeId, slotIndex, boundAgentId, onBindingChange, onOpenChat, manifest }: CharacterModalProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // AVG themes use a full-screen visual novel overlay
  if (manifest?.renderer === "avg" && manifest.avgCharacters) {
    return (
      <AvgOverlay
        isOpen={isOpen}
        onClose={onClose}
        themeId={themeId}
        manifest={manifest}
        slotIndex={slotIndex}
        agent={agent}
        agents={agents}
        boundAgentId={boundAgentId}
        onBindingChange={onBindingChange}
        onOpenChat={onOpenChat}
      />
    );
  }

  const isUuidName = agent?.name && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(agent.name);
  const title = (!agent?.name || isUuidName) ? "Arinova Assistant" : agent.name;
  const content = agent
    ? <CharacterDetail agent={agent} agents={agents} themeId={themeId} slotIndex={slotIndex} boundAgentId={boundAgentId} onBindingChange={onBindingChange} onOpenChat={onOpenChat} />
    : <CharacterDetailOffline />;

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl border-slate-700 bg-slate-900">
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
