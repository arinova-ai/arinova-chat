"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AgentModal } from "./agent-modal";
import { CharacterModal } from "./character-modal";
import { FloatChatWindow } from "./float-chat-window";
import { ThemeIframe } from "./theme-iframe";
import { ArinovaSpinner } from "@/components/ui/arinova-spinner";
import { useOfficeStream } from "@/hooks/use-office-stream";
import { useTheme } from "./theme-context";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Agent } from "./types";


interface BindingRow {
  slotIndex: number;
  agentId: string;
  agentName: string | null;
  agentAvatarUrl: string | null;
}

function makeEmptySlot(index: number): Agent {
  return {
    id: `empty-${index}`,
    name: "Not Connected",
    status: "unbound",
    emoji: "\u{1F4A4}",
    role: "",
    color: "#666",
    recentActivity: [],
  };
}

function OfficeViewInner() {
  const stream = useOfficeStream();
  const { manifest, loading, themeId, themes } = useTheme();
  const themeEntry = themes.find((t) => t.id === themeId);
  const maxAgents = themeEntry?.maxAgents ?? 6;

  const { data: session } = authClient.useSession();
  const sessionUser = session?.user as { id?: string; name?: string; username?: string } | undefined;
  const iframeUser = {
    id: sessionUser?.id ?? "",
    name: sessionUser?.name ?? "",
    username: sessionUser?.username ?? "",
  };

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [characterModalSlot, setCharacterModalSlot] = useState<number | null>(null);
  const [floatWindows, setFloatWindows] = useState<string[]>([]);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });

  // ── Slot bindings (API-backed) ──────────────────────────
  const [bindings, setBindings] = useState<BindingRow[]>([]);
  const autoBindAttempted = useRef(false);

  const fetchBindings = useCallback(async () => {
    try {
      const rows = await api<BindingRow[]>(
        `/api/office/bindings?themeId=${encodeURIComponent(themeId)}`,
        { silent: true },
      );
      setBindings(rows);
    } catch { /* ignore — user may not be logged in yet */ }
  }, [themeId]);

  useEffect(() => {
    fetchBindings();
  }, [fetchBindings]);

  // Build slot-based agent array
  const displayAgents = stream.agents.slice(0, maxAgents);

  const slots: Agent[] = Array.from({ length: maxAgents }, (_, i) => {
    const binding = bindings.find((b) => b.slotIndex === i);
    if (binding) {
      const agent = stream.agents.find((a) => a.id === binding.agentId);
      if (agent) return agent;
      // Agent bound but not streaming — show fallback with idle status
      if (binding.agentName) {
        return {
          id: binding.agentId,
          name: binding.agentName,
          role: "",
          emoji: "\u{1F916}",
          color: "#64748b",
          status: "idle" as const,
          recentActivity: [],
        };
      }
    }
    return makeEmptySlot(i);
  });

  // Auto-bind unbound agents to empty slots
  useEffect(() => {
    if (displayAgents.length === 0 || autoBindAttempted.current) return;
    const boundAgentIds = new Set(bindings.map((b) => b.agentId));
    const boundSlots = new Set(bindings.map((b) => b.slotIndex));
    const unboundAgents = displayAgents.filter((a) => !boundAgentIds.has(a.id));
    if (unboundAgents.length === 0) return;
    autoBindAttempted.current = true;
    const bindAll = async () => {
      let slotIdx = 0;
      for (const agent of unboundAgents) {
        while (boundSlots.has(slotIdx) && slotIdx < maxAgents) slotIdx++;
        if (slotIdx >= maxAgents) break;
        try {
          await api("/api/office/bindings", {
            method: "PUT",
            body: JSON.stringify({ themeId, slotIndex: slotIdx, agentId: agent.id }),
            silent: true,
          });
          boundSlots.add(slotIdx);
        } catch { /* skip failed slots */ }
        slotIdx++;
      }
      fetchBindings();
    };
    bindAll();
  }, [bindings, displayAgents, themeId, maxAgents, fetchBindings]);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const selectedAgent = displayAgents.find((a) => a.id === selectedAgentId) ?? null;

  // Character modal agent/binding for the selected slot
  const characterSlotAgent = characterModalSlot !== null ? slots[characterModalSlot] ?? null : null;
  const characterSlotBinding = characterModalSlot !== null
    ? bindings.find((b) => b.slotIndex === characterModalSlot)
    : undefined;

  const openFloatWindow = useCallback((agentId: string) => {
    setFloatWindows((prev) => prev.includes(agentId) ? prev : [...prev, agentId]);
  }, []);

  const closeFloatWindow = useCallback((agentId: string) => {
    setFloatWindows((prev) => prev.filter((id) => id !== agentId));
  }, []);

  const selectAgent = useCallback((id: string | null) => {
    if (!id) return;
    openFloatWindow(id);
  }, [openFloatWindow]);

  const closeModal = useCallback(() => setSelectedAgentId(null), []);
  const closeCharacterModal = useCallback(() => setCharacterModalSlot(null), []);
  const handleOpenChat = useCallback((agentId: string) => {
    setCharacterModalSlot(null);
    openFloatWindow(agentId);
  }, [openFloatWindow]);
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setMapSize({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const themeReady = !loading && !!manifest;

  return (
    <div className="flex h-full flex-col text-white overflow-hidden">
      {/* Office map area — always takes full remaining space; ref must always mount for ResizeObserver */}
      <div ref={mapContainerRef} className="flex-1 min-h-0">
        {!themeReady ? (
          <div className="flex h-full items-center justify-center">
            <ArinovaSpinner />
          </div>
        ) : (
          mapSize.width > 0 && mapSize.height > 0 && (
            <ThemeIframe
              themeId={themeId}
              agents={slots}
              user={iframeUser}
              width={mapSize.width}
              height={mapSize.height}
              isMobile={isMobile}
              onSelectAgent={(id) => selectAgent(id)}
              onOpenChat={handleOpenChat}
            />
          )
        )}
      </div>

      {/* Agent detail modal (non-iframe themes — multi-agent click) */}
      <AgentModal agent={selectedAgent} agents={displayAgents} onClose={closeModal} />

      {/* Character modal (any slot — bind/unbind/switch) */}
      <CharacterModal
        isOpen={characterModalSlot !== null}
        onClose={closeCharacterModal}
        agent={characterSlotAgent?.status !== "unbound" ? characterSlotAgent : null}
        agents={displayAgents}
        themeId={themeId}
        slotIndex={characterModalSlot ?? 0}
        boundAgentId={characterSlotBinding?.agentId ?? null}
        onBindingChange={fetchBindings}
        onOpenChat={handleOpenChat}
      />

      {/* Float chat windows */}
      {floatWindows.map((fwAgentId, idx) => {
        const agent = stream.agents.find((a) => a.id === fwAgentId);
        return (
          <FloatChatWindow
            key={fwAgentId}
            agentId={fwAgentId}
            agentName={agent?.name}
            agentAvatar={undefined}
            onClose={() => closeFloatWindow(fwAgentId)}
            offsetIndex={idx}
            isMobile={isMobile}
          />
        );
      })}
    </div>
  );
}

export function OfficeView() {
  return <OfficeViewInner />;
}
