"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import StatusBar from "./status-bar";
import { AgentModal } from "./agent-modal";
import { useOfficeStream } from "@/hooks/use-office-stream";
import { MOCK_AGENTS } from "./mock-data";
import { ThemeProvider, useTheme } from "./theme-context";

// Dynamic import — PixiJS only works client-side
const OfficeMap = dynamic(() => import("./office-map"), { ssr: false });

function OfficeViewInner() {
  const stream = useOfficeStream();
  const agents = stream.agents.length > 0 ? stream.agents : MOCK_AGENTS;
  const { manifest, themeId } = useTheme();

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;

  const selectAgent = useCallback((id: string | null) => {
    setSelectedAgentId(id);
  }, []);

  const closeModal = useCallback(() => setSelectedAgentId(null), []);

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
        <StatusBar agents={agents} />
      </div>

      {/* Office map area — always takes full remaining space */}
      <div ref={mapContainerRef} className="flex-1 min-h-0">
        {mapSize.width > 0 && mapSize.height > 0 && (
          <OfficeMap
            agents={agents}
            selectedAgentId={selectedAgentId}
            onSelectAgent={selectAgent}
            width={mapSize.width}
            height={mapSize.height}
            manifest={manifest}
            themeId={themeId}
          />
        )}
      </div>

      {/* Agent detail modal */}
      <AgentModal agent={selectedAgent} agents={agents} onClose={closeModal} />
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
