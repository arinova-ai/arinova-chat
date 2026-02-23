"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import StatusBar from "./status-bar";
import DetailPanel from "./detail-panel";
import { useOfficeStream } from "@/hooks/use-office-stream";
import { MOCK_AGENTS } from "./mock-data";

// Dynamic import — PixiJS only works client-side
const OfficeMap = dynamic(() => import("./office-map"), { ssr: false });

export function OfficeView() {
  const stream = useOfficeStream();
  // Use SSE agents when available, fall back to mock data for demo
  const agents = stream.agents.length > 0 ? stream.agents : MOCK_AGENTS;

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;

  const selectAgent = useCallback((id: string | null) => {
    setSelectedAgentId((prev) => (prev === id ? null : id));
  }, []);

  const handleClose = useCallback(() => selectAgent(null), [selectAgent]);

  // Measure available space for the map
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

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-0 gap-3">
        {/* Office map area */}
        <div
          ref={mapContainerRef}
          className={`flex-1 min-h-0 ${selectedAgent ? "max-h-[60%]" : ""} transition-all duration-300`}
        >
          {mapSize.width > 0 && mapSize.height > 0 && (
            <OfficeMap
              agents={agents}
              selectedAgentId={selectedAgentId}
              onSelectAgent={selectAgent}
              width={mapSize.width}
              height={mapSize.height}
            />
          )}
        </div>

        {/* Detail panel */}
        {selectedAgent && (
          <div className="shrink-0 max-h-[40%] overflow-y-auto rounded-xl">
            <DetailPanel agent={selectedAgent} agents={agents} onClose={handleClose} />
          </div>
        )}
      </div>
    </div>
  );
}
