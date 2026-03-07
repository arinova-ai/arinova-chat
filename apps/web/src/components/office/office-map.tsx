"use client";

import { useEffect, useRef, useState } from "react";
import type { Agent } from "./types";
import type { ThemeManifest, RendererType } from "./theme-types";
import { createRenderer } from "./renderer";
import type { OfficeRenderer } from "./renderer/types";

interface Props {
  agents: Agent[];
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
  onCharacterClick?: () => void;
  width: number;
  height: number;
  manifest?: ThemeManifest | null;
  themeId?: string;
}

export default function OfficeMap({
  agents,
  selectedAgentId,
  onSelectAgent,
  onCharacterClick,
  width,
  height,
  manifest = null,
  themeId,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<OfficeRenderer | null>(null);
  const readyRef = useRef(false);

  // Keep latest callbacks accessible to the renderer
  const onSelectRef = useRef(onSelectAgent);
  onSelectRef.current = onSelectAgent;
  const onCharacterClickRef = useRef(onCharacterClick);
  onCharacterClickRef.current = onCharacterClick;

  // Keep latest values accessible via refs for post-init application
  const pendingAgentsRef = useRef(agents);
  const pendingSelectionRef = useRef(selectedAgentId);
  const widthRef = useRef(width);
  const heightRef = useRef(height);
  pendingAgentsRef.current = agents;
  pendingSelectionRef.current = selectedAgentId;
  widthRef.current = width;
  heightRef.current = height;

  // ── Quality change listener — triggers full re-init ────────
  const [qualityVersion, setQualityVersion] = useState(0);
  useEffect(() => {
    const handler = () => setQualityVersion((v) => v + 1);
    window.addEventListener("arinova:quality-change", handler);
    return () => window.removeEventListener("arinova:quality-change", handler);
  }, []);

  // ── Init / re-init when theme or quality changes ──────────
  useEffect(() => {
    if (!canvasRef.current) return;
    const container = canvasRef.current;
    let destroyed = false;

    const rendererType: RendererType = manifest?.renderer ?? "pixi";
    const renderer = createRenderer(rendererType);
    renderer.onAgentClick = (id: string) => onSelectRef.current(id);
    renderer.onCharacterClick = () => onCharacterClickRef.current?.();

    renderer
      .init(container, width, height, manifest, themeId)
      .then(() => {
        if (destroyed) {
          renderer.destroy();
          return;
        }
        rendererRef.current = renderer;
        readyRef.current = true;

        // Catch up with latest size (may have changed during async init)
        renderer.resize(widthRef.current, heightRef.current);

        // Apply latest state
        renderer.updateAgents(pendingAgentsRef.current);
        renderer.selectAgent(pendingSelectionRef.current);
      })
      .catch((err) => {
        console.warn("[OfficeMap] Renderer init failed:", err);
      });

    return () => {
      destroyed = true;
      readyRef.current = false;
      rendererRef.current = null;
      renderer.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, themeId, qualityVersion]);

  // ── Resize ────────────────────────────────────────────────────
  useEffect(() => {
    if (readyRef.current) {
      rendererRef.current?.resize(width, height);
    }
  }, [width, height]);

  // ── Update agents ─────────────────────────────────────────────
  useEffect(() => {
    if (readyRef.current) {
      rendererRef.current?.updateAgents(agents);
    }
  }, [agents]);

  // ── Selection change ──────────────────────────────────────────
  useEffect(() => {
    if (readyRef.current) {
      rendererRef.current?.selectAgent(selectedAgentId);
    }
  }, [selectedAgentId]);

  return <div ref={canvasRef} style={{ width, height }} className="rounded-xl overflow-hidden" />;
}
