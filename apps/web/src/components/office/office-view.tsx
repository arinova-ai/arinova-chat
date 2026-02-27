"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import StatusBar from "./status-bar";
import { AgentModal } from "./agent-modal";
import { CharacterModal } from "./character-modal";
import { useOfficeStream } from "@/hooks/use-office-stream";
import { MOCK_AGENTS } from "./mock-data";
import { ThemeProvider, useTheme } from "./theme-context";
import { THEME_REGISTRY } from "./theme-registry";
import type { Agent, AgentStatus } from "./types";

// Dynamic import — PixiJS only works client-side
const OfficeMap = dynamic(() => import("./office-map"), { ssr: false });

function OfficeViewInner() {
  const stream = useOfficeStream();
  const { manifest, themeId } = useTheme();
  const themeEntry = THEME_REGISTRY.find((t) => t.id === themeId);
  const maxAgents = themeEntry?.maxAgents ?? 6;
  const isDemoMode = stream.agents.length === 0;
  const allAgents = isDemoMode ? MOCK_AGENTS : stream.agents;
  const agents = allAgents.slice(0, maxAgents);

  const [demoStatus, setDemoStatus] = useState<AgentStatus>("working");

  useEffect(() => {
    if (!isDemoMode) return;
    const interval = setInterval(() => {
      setDemoStatus((prev) => {
        if (prev === "working") return "idle";
        if (prev === "idle") return "blocked";
        return "working";
      });
    }, 10_000);
    return () => clearInterval(interval);
  }, [isDemoMode]);

  const displayAgents = isDemoMode
    ? agents.map((a) => ({ ...a, status: demoStatus, collaboratingWith: undefined }))
    : agents;

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });

  const selectedAgent = displayAgents.find((a) => a.id === selectedAgentId) ?? null;

  // For v3 single-character themes, use the first real agent or a demo fallback
  const characterAgent: Agent | null = displayAgents.length > 0
    ? displayAgents[0]
    : null;

  const selectAgent = useCallback((id: string | null) => {
    setSelectedAgentId(id);
  }, []);

  const closeModal = useCallback(() => setSelectedAgentId(null), []);
  const handleCharacterClick = useCallback(() => setShowCharacterModal(true), []);
  const closeCharacterModal = useCallback(() => setShowCharacterModal(false), []);

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

  return (
    <div className="flex h-full flex-col text-white overflow-hidden">
      {/* Status summary */}
      <div className="shrink-0 pb-3">
        <StatusBar agents={displayAgents} />
      </div>

      {/* Office map area — always takes full remaining space */}
      <div ref={mapContainerRef} className="flex-1 min-h-0">
        {mapSize.width > 0 && mapSize.height > 0 && (
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
        )}
      </div>

      {/* Agent detail modal */}
      <AgentModal agent={selectedAgent} agents={displayAgents} onClose={closeModal} />

      {/* Character modal (v3 themes) */}
      <CharacterModal
        isOpen={showCharacterModal}
        onClose={closeCharacterModal}
        agent={characterAgent}
      />
    </div>
  );
}

export function OfficeView() {
  return (
    <ThemeProvider>
      <OfficeViewInner />
    </ThemeProvider>
  );
}
