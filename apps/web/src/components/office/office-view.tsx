"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import StatusBar from "./status-bar";
import { AgentModal } from "./agent-modal";
import { CharacterModal } from "./character-modal";
import { OfficeChatPanel } from "./office-chat-panel";
import { ThemeIframe } from "./theme-iframe";
import { ArinovaSpinner } from "@/components/ui/arinova-spinner";
import { useOfficeStream } from "@/hooks/use-office-stream";
import { useTheme } from "./theme-context";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import type { Agent } from "./types";

const THEME_SDK_V2_KEY = "arinova_theme_sdk_v2";

function useThemeSdkV2(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const env = process.env.NEXT_PUBLIC_THEME_SDK_V2;
    if (env === "true" || env === "1") {
      setEnabled(true);
      return;
    }
    if (typeof window !== "undefined" && localStorage.getItem(THEME_SDK_V2_KEY) === "true") {
      setEnabled(true);
    }
  }, []);
  return enabled;
}

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
  const { manifest, loading, themeId, themes } = useTheme();
  const themeEntry = themes.find((t) => t.id === themeId);
  const maxAgents = themeEntry?.maxAgents ?? 6;
  const displayAgents = stream.agents.slice(0, maxAgents);
  const sdkV2 = useThemeSdkV2();

  const { data: session } = authClient.useSession();
  const sessionUser = session?.user as { id?: string; name?: string; username?: string } | undefined;
  const iframeUser = {
    id: sessionUser?.id ?? "",
    name: sessionUser?.name ?? "",
    username: sessionUser?.username ?? "",
  };

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showCharacterModal, setShowCharacterModal] = useState(false);
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

  // Derive character agent from binding → all stream agents (not just displayAgents,
  // which may be capped by maxAgents). If the bound agent isn't streaming office
  // events at all, create a minimal fallback from the binding metadata so the
  // character modal shows agent info with "Idle" status instead of "not connected".
  const slot0Binding = bindings.find((b) => b.slotIndex === 0);
  const characterAgent: Agent | null = slot0Binding
    ? stream.agents.find((a) => a.id === slot0Binding.agentId)
      ?? (slot0Binding.agentName ? {
          id: slot0Binding.agentId,
          name: slot0Binding.agentName,
          role: "",
          emoji: "\u{1F916}",
          color: "#64748b",
          status: "idle" as const,
          recentActivity: [],
        } : null)
    : displayAgents[0] ?? null;

  const selectedAgent = displayAgents.find((a) => a.id === selectedAgentId) ?? null;

  const selectAgent = useCallback((id: string | null) => {
    setSelectedAgentId(id);
  }, []);

  const closeModal = useCallback(() => setSelectedAgentId(null), []);
  const handleCharacterClick = useCallback(() => setShowCharacterModal(true), []);
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
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

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
        ) : sdkV2 ? (
          mapSize.width > 0 && mapSize.height > 0 && (
            <ThemeIframe
              themeId={themeId}
              agents={displayAgents}
              user={iframeUser}
              width={mapSize.width}
              height={mapSize.height}
              isMobile={isMobile}
              onSelectAgent={(id) => selectAgent(id)}
              onOpenChat={handleOpenChat}
            />
          )
        ) : (
          mapSize.width > 0 && mapSize.height > 0 && (
            <OfficeMap
              agents={displayAgents}
              selectedAgentId={selectedAgentId}
              onSelectAgent={selectAgent}
              onCharacterClick={handleCharacterClick}
              width={mapSize.width}
              height={mapSize.height}
              manifest={manifest}
              themeId={themeId}
            />
          )
        )}
      </div>

      {/* Agent detail modal (v2/PixiJS themes — multi-agent click) */}
      {manifest?.renderer !== "sprite" && (
        <AgentModal agent={selectedAgent} agents={displayAgents} onClose={closeModal} />
      )}

      {/* Character modal (v3/v4 single-character themes) */}
      <CharacterModal
        isOpen={showCharacterModal}
        onClose={closeCharacterModal}
        agent={characterAgent}
        agents={displayAgents}
        themeId={themeId}
        slotIndex={0}
        boundAgentId={slot0Binding?.agentId ?? null}
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
