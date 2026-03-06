"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import StatusBar from "./status-bar";
import { AgentModal } from "./agent-modal";
import { CharacterModal } from "./character-modal";
import { OfficeChatPanel } from "./office-chat-panel";
import { ArinovaSpinner } from "@/components/ui/arinova-spinner";
import { useOfficeStream } from "@/hooks/use-office-stream";
import { useTheme } from "./theme-context";
import { THEME_REGISTRY } from "./theme-registry";
import { api } from "@/lib/api";
import type { Agent } from "./types";

interface BindingRow {
  slotIndex: number;
  agentId: string;
  agentName: string | null;
  agentAvatarUrl: string | null;
}

// Dynamic import — PixiJS only works client-side
const OfficeMap = dynamic(() => import("./office-map"), { ssr: false });

function OfficeViewInner() {
  const stream = useOfficeStream();
  const { manifest, loading, themeId } = useTheme();
  const themeEntry = THEME_REGISTRY.find((t) => t.id === themeId);
  const maxAgents = themeEntry?.maxAgents ?? 6;
  const displayAgents = stream.agents.slice(0, maxAgents);

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  const [clickedSlotIndex, setClickedSlotIndex] = useState(0);
  const [chatAgentId, setChatAgentId] = useState<string | null>(null);
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

  // Auto-bind first display agent to slot 0 when no bindings exist
  useEffect(() => {
    if (bindings.length > 0 || displayAgents.length === 0 || autoBindAttempted.current) return;
    autoBindAttempted.current = true;
    api("/api/office/bindings", {
      method: "PUT",
      body: JSON.stringify({ themeId, slotIndex: 0, agentId: displayAgents[0].id }),
      silent: true,
    }).then(() => fetchBindings()).catch(() => {});
  }, [bindings.length, displayAgents, themeId, fetchBindings]);

  // Derive character agent from the clicked slot's binding.
  // For multi-slot themes (avg) unbound slots show null; single-slot themes fall back to first agent.
  const isMultiSlot = manifest?.renderer === "avg";
  const activeBinding = bindings.find((b) => b.slotIndex === clickedSlotIndex);
  const characterAgent: Agent | null = activeBinding
    ? stream.agents.find((a) => a.id === activeBinding.agentId)
      ?? (activeBinding.agentName ? {
          id: activeBinding.agentId,
          name: activeBinding.agentName,
          role: "",
          emoji: "\u{1F916}",
          color: "#64748b",
          status: "idle" as const,
          recentActivity: [],
        } : null)
    : (isMultiSlot ? null : displayAgents[0] ?? null);

  const selectedAgent = displayAgents.find((a) => a.id === selectedAgentId) ?? null;

  const selectAgent = useCallback((id: string | null) => {
    setSelectedAgentId(id);
  }, []);

  const closeModal = useCallback(() => setSelectedAgentId(null), []);
  const handleCharacterClick = useCallback(() => setShowCharacterModal(true), []);
  const handleSlotClick = useCallback((slotIndex: number) => {
    setClickedSlotIndex(slotIndex);
    setShowCharacterModal(true);
  }, []);
  const closeCharacterModal = useCallback(() => setShowCharacterModal(false), []);
  const handleOpenChat = useCallback((agentId: string) => {
    setShowCharacterModal(false);
    setChatAgentId(agentId);
  }, []);
  const closeChatPanel = useCallback(() => setChatAgentId(null), []);

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
      {/* Status summary */}
      {themeReady && (
        <div className="shrink-0 pb-3">
          <StatusBar agents={displayAgents} />
        </div>
      )}

      {/* Office map area — always takes full remaining space; ref must always mount for ResizeObserver */}
      <div ref={mapContainerRef} className="flex-1 min-h-0">
        {!themeReady ? (
          <div className="flex h-full items-center justify-center">
            <ArinovaSpinner />
          </div>
        ) : (
          mapSize.width > 0 && mapSize.height > 0 && (
            <OfficeMap
              agents={displayAgents}
              selectedAgentId={selectedAgentId}
              onSelectAgent={selectAgent}
              onCharacterClick={handleCharacterClick}
              onSlotClick={handleSlotClick}
              bindings={bindings}
              width={mapSize.width}
              height={mapSize.height}
              manifest={manifest}
              themeId={themeId}
            />
          )
        )}
      </div>

      {/* Agent detail modal (v2/PixiJS themes — multi-agent click) */}
      {manifest?.renderer !== "sprite" && manifest?.renderer !== "avg" && (
        <AgentModal agent={selectedAgent} agents={displayAgents} onClose={closeModal} />
      )}

      {/* Character modal (v3/v4 single-character themes) */}
      <CharacterModal
        isOpen={showCharacterModal}
        onClose={closeCharacterModal}
        agent={characterAgent}
        agents={displayAgents}
        themeId={themeId}
        slotIndex={clickedSlotIndex}
        boundAgentId={activeBinding?.agentId ?? null}
        onBindingChange={fetchBindings}
        onOpenChat={handleOpenChat}
      />

      {/* Inline chat panel */}
      {chatAgentId && (
        <OfficeChatPanel
          open={!!chatAgentId}
          onClose={closeChatPanel}
          agentId={chatAgentId}
        />
      )}
    </div>
  );
}

export function OfficeView() {
  return <OfficeViewInner />;
}
