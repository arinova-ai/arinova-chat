"use client";

import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics, Text, TextStyle, Rectangle } from "pixi.js";
import type { Agent, AgentStatus } from "./types";

// Layout constants
const ZONE_PAD = 20;
const AVATAR_R = 28;
const STATUS_COLORS: Record<AgentStatus, number> = {
  working: 0x16a34a,
  idle: 0xf59e0b,
  blocked: 0xdc2626,
  collaborating: 0x2563eb,
};
const STATUS_LABELS: Record<AgentStatus, string> = {
  working: "Working",
  idle: "Idle",
  blocked: "Blocked",
  collaborating: "Collab",
};
const ZONE_BG = 0x1e293b;
const ZONE_BORDER = 0x334155;

interface ZoneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function calcZones(cw: number, ch: number) {
  const pad = ZONE_PAD;
  const gap = 12;
  const totalH = ch - pad * 2 - gap;
  const topH = Math.floor(totalH * 0.65);
  const botH = totalH - topH;
  const totalW = cw - pad * 2 - gap;
  const workW = Math.floor(totalW * 0.55);
  const meetW = totalW - workW;

  const work: ZoneRect = { x: pad, y: pad, w: workW, h: topH };
  const meeting: ZoneRect = { x: pad + workW + gap, y: pad, w: meetW, h: topH };
  const breakArea: ZoneRect = { x: pad, y: pad + topH + gap, w: cw - pad * 2, h: botH };
  return { work, meeting, break: breakArea };
}

function agentZone(agent: Agent): "work" | "meeting" | "break" {
  if (agent.status === "collaborating") return "meeting";
  if (agent.status === "idle") return "break";
  return "work";
}

function agentSlotPos(idx: number, count: number, zone: ZoneRect) {
  // Minimum spacing must fit avatar diameter + name gap
  const minSpacing = AVATAR_R * 2 + 16;
  const maxHorizSlots = Math.max(1, Math.floor((zone.w - 40) / minSpacing));

  if (count <= maxHorizSlots) {
    // Single row — all fit horizontally
    const spacing = Math.min(90, (zone.w - 40) / Math.max(count, 1));
    const totalW = spacing * (count - 1);
    const startX = zone.x + zone.w / 2 - totalW / 2;
    return { x: startX + idx * spacing, y: zone.y + zone.h / 2 };
  }

  // Multi-row layout for narrow zones
  const cols = maxHorizSlots;
  const row = Math.floor(idx / cols);
  const col = idx % cols;
  const rowCount = Math.min(count - row * cols, cols);
  const spacing = Math.min(90, (zone.w - 40) / Math.max(rowCount, 1));
  const totalW = spacing * (rowCount - 1);
  const startX = zone.x + zone.w / 2 - totalW / 2;
  const rowGap = AVATAR_R * 2 + 30;
  const totalRows = Math.ceil(count / cols);
  const startY = zone.y + zone.h / 2 - ((totalRows - 1) * rowGap) / 2;
  return { x: startX + col * spacing, y: startY + row * rowGap };
}

// Reusable text styles (created once)
const LABEL_STYLE = new TextStyle({
  fontFamily: "system-ui, sans-serif",
  fontSize: 11,
  fontWeight: "600",
  fill: 0x64748b,
  letterSpacing: 1,
});
const EMOJI_STYLE = new TextStyle({ fontFamily: "system-ui, sans-serif", fontSize: 22 });
const NAME_STYLE = new TextStyle({
  fontFamily: "system-ui, sans-serif",
  fontSize: 12,
  fontWeight: "600",
  fill: 0xe2e8f0,
});
const WARN_STYLE = new TextStyle({ fontSize: 16 });
const DOTS_STYLE = new TextStyle({ fontSize: 14, fill: 0x16a34a });

// Per-agent display object group
interface AgentSprite {
  container: Container;
  glow: Graphics;
  ring: Graphics;
  avatar: Graphics;
  emoji: Text;
  nameLabel: Text;
  statusLabel: Text;
  warnBadge: Text;
  dotsBadge: Text;
  hitArea: Graphics;
}

function createAgentSprite(agent: Agent, onSelect: () => void): AgentSprite {
  const container = new Container();

  // Selection glow (hidden by default)
  const glow = new Graphics();
  glow.visible = false;
  container.addChild(glow);

  // Status ring
  const ring = new Graphics();
  container.addChild(ring);

  // Avatar bg circle
  const avatar = new Graphics();
  const bgColor = parseInt(agent.color.replace("#", ""), 16);
  avatar.circle(0, 0, AVATAR_R);
  avatar.fill(bgColor);
  container.addChild(avatar);

  // Emoji
  const emoji = new Text({ text: agent.emoji, style: EMOJI_STYLE });
  emoji.anchor.set(0.5);
  container.addChild(emoji);

  // Name
  const nameLabel = new Text({ text: agent.name, style: NAME_STYLE });
  nameLabel.anchor.set(0.5);
  nameLabel.y = AVATAR_R + 14;
  container.addChild(nameLabel);

  // Status text
  const statusLabel = new Text({
    text: STATUS_LABELS[agent.status],
    style: new TextStyle({
      fontFamily: "system-ui, sans-serif",
      fontSize: 10,
      fill: STATUS_COLORS[agent.status],
    }),
  });
  statusLabel.anchor.set(0.5);
  statusLabel.y = AVATAR_R + 28;
  container.addChild(statusLabel);

  // Warning badge (blocked)
  const warnBadge = new Text({ text: "\u26a0\ufe0f", style: WARN_STYLE });
  warnBadge.anchor.set(0.5);
  warnBadge.x = AVATAR_R - 4;
  warnBadge.y = -AVATAR_R + 4;
  warnBadge.visible = agent.status === "blocked";
  container.addChild(warnBadge);

  // Working dots
  const dotsBadge = new Text({ text: "\u2022\u2022\u2022", style: DOTS_STYLE });
  dotsBadge.anchor.set(0.5);
  dotsBadge.x = AVATAR_R + 12;
  dotsBadge.y = -8;
  dotsBadge.visible = agent.status === "working";
  container.addChild(dotsBadge);

  // Hit area
  const hitArea = new Graphics();
  hitArea.circle(0, 0, AVATAR_R + 10);
  hitArea.fill({ color: 0xffffff, alpha: 0.001 });
  hitArea.eventMode = "static";
  hitArea.cursor = "pointer";
  hitArea.on("pointerdown", onSelect);
  container.addChild(hitArea);

  return { container, glow, ring, avatar, emoji, nameLabel, statusLabel, warnBadge, dotsBadge, hitArea };
}

function updateAgentVisuals(sprite: AgentSprite, agent: Agent, isSelected: boolean) {
  const statusColor = STATUS_COLORS[agent.status];

  // Glow
  sprite.glow.clear();
  if (isSelected) {
    sprite.glow.circle(0, 0, AVATAR_R + 8);
    sprite.glow.fill({ color: statusColor, alpha: 0.2 });
    sprite.glow.visible = true;
  } else {
    sprite.glow.visible = false;
  }

  // Ring
  sprite.ring.clear();
  sprite.ring.circle(0, 0, AVATAR_R + 3);
  sprite.ring.stroke({ width: 3, color: statusColor });

  // Status label
  sprite.statusLabel.text = STATUS_LABELS[agent.status];
  sprite.statusLabel.style.fill = statusColor;

  // Indicator badges
  sprite.warnBadge.visible = agent.status === "blocked";
  sprite.dotsBadge.visible = agent.status === "working";
}

interface Props {
  agents: Agent[];
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
  width: number;
  height: number;
}

export default function OfficeMap({ agents, selectedAgentId, onSelectAgent, width, height }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const [ready, setReady] = useState(false);

  // Persistent display object refs
  const zoneContainerRef = useRef<Container | null>(null);
  const agentContainerRef = useRef<Container | null>(null);
  const linesGraphicsRef = useRef<Graphics | null>(null);
  const spritesRef = useRef<Map<string, AgentSprite>>(new Map());
  const posRef = useRef<Record<string, { x: number; y: number }>>({});
  const targetRef = useRef<Record<string, { x: number; y: number }>>({});

  // Initialize PixiJS once
  useEffect(() => {
    if (!canvasRef.current) return;

    const app = new Application();
    appRef.current = app;
    setReady(false);

    app
      .init({
        width,
        height,
        backgroundColor: 0x0f172a,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })
      .then(() => {
        // Guard: skip if this app was already cleaned up (React StrictMode)
        if (appRef.current !== app) return;
        if (!canvasRef.current || !app.canvas) return;

        canvasRef.current.appendChild(app.canvas);
        app.stage.eventMode = "static";
        app.stage.hitArea = new Rectangle(0, 0, width, height);

        // Create persistent layers
        const zoneContainer = new Container();
        const agentContainer = new Container();
        const linesGraphics = new Graphics();
        app.stage.addChild(zoneContainer);
        app.stage.addChild(linesGraphics);
        app.stage.addChild(agentContainer);

        zoneContainerRef.current = zoneContainer;
        agentContainerRef.current = agentContainer;
        linesGraphicsRef.current = linesGraphics;

        setReady(true);
      });

    return () => {
      appRef.current = null;
      zoneContainerRef.current = null;
      agentContainerRef.current = null;
      linesGraphicsRef.current = null;
      spritesRef.current.clear();
      try {
        app.destroy(true);
      } catch {
        /* PixiJS destroy can fail during async teardown */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize
  useEffect(() => {
    const app = appRef.current;
    if (!app || !ready) return;
    app.renderer.resize(width, height);
    // Ensure CSS size matches (autoDensity may not update after init)
    if (app.canvas) {
      (app.canvas as HTMLCanvasElement).style.width = `${width}px`;
      (app.canvas as HTMLCanvasElement).style.height = `${height}px`;
    }
    app.stage.hitArea = new Rectangle(0, 0, width, height);
  }, [width, height, ready]);

  // Rebuild zone graphics on resize
  useEffect(() => {
    const container = zoneContainerRef.current;
    if (!container || !ready) return;

    container.removeChildren();
    const zones = calcZones(width, height);
    const zoneLabels: Record<string, string> = {
      work: "WORK AREA",
      meeting: "MEETING ROOM",
      break: "BREAK AREA  \u2615",
    };

    for (const [key, zone] of Object.entries(zones) as [string, ZoneRect][]) {
      const g = new Graphics();
      g.roundRect(zone.x, zone.y, zone.w, zone.h, 12);
      g.fill(ZONE_BG);
      g.roundRect(zone.x, zone.y, zone.w, zone.h, 12);
      g.stroke({ width: 1, color: ZONE_BORDER });
      container.addChild(g);

      const label = new Text({ text: zoneLabels[key], style: LABEL_STYLE });
      label.x = zone.x + 12;
      label.y = zone.y + 8;
      container.addChild(label);
    }
  }, [width, height, ready]);

  // Sync agent sprites — create/remove when agent list changes
  useEffect(() => {
    const agentContainer = agentContainerRef.current;
    if (!agentContainer || !ready) return;

    const currentIds = new Set(agents.map((a) => a.id));
    const sprites = spritesRef.current;

    // Remove sprites for agents no longer in list
    for (const [id, sprite] of sprites) {
      if (!currentIds.has(id)) {
        agentContainer.removeChild(sprite.container);
        sprite.container.destroy({ children: true });
        sprites.delete(id);
      }
    }

    // Create sprites for new agents
    for (const agent of agents) {
      if (!sprites.has(agent.id)) {
        const sprite = createAgentSprite(agent, () => onSelectAgent(agent.id));
        sprites.set(agent.id, sprite);
        agentContainer.addChild(sprite.container);
      }
    }
  }, [agents, onSelectAgent, ready]);

  // Update visuals when state or selection changes
  useEffect(() => {
    const sprites = spritesRef.current;
    for (const agent of agents) {
      const sprite = sprites.get(agent.id);
      if (sprite) {
        updateAgentVisuals(sprite, agent, agent.id === selectedAgentId);
      }
    }
  }, [agents, selectedAgentId]);

  // Compute target positions when agents/size change
  useEffect(() => {
    if (!ready) return;
    const zones = calcZones(width, height);
    const grouped: Record<string, Agent[]> = { work: [], meeting: [], break: [] };
    for (const a of agents) grouped[agentZone(a)].push(a);

    for (const [zoneKey, zoneAgents] of Object.entries(grouped)) {
      const zone = zones[zoneKey as keyof typeof zones];
      zoneAgents.forEach((agent, idx) => {
        const target = agentSlotPos(idx, zoneAgents.length, zone);
        targetRef.current[agent.id] = target;
        // Initialize position if new
        if (!posRef.current[agent.id]) {
          posRef.current[agent.id] = { ...target };
        }
      });
    }
  }, [agents, width, height, ready]);

  // Animation tick — only updates positions and collab lines
  useEffect(() => {
    if (!ready) return;

    let animId: number;
    const tick = () => {
      const sprites = spritesRef.current;
      const lines = linesGraphicsRef.current;

      // Lerp positions
      for (const [id, target] of Object.entries(targetRef.current)) {
        const cur = posRef.current[id];
        if (!cur) continue;
        cur.x += (target.x - cur.x) * 0.15;
        cur.y += (target.y - cur.y) * 0.15;

        const sprite = sprites.get(id);
        if (sprite) {
          sprite.container.x = cur.x;
          sprite.container.y = cur.y;
        }
      }

      // Redraw collaboration lines
      if (lines) {
        lines.clear();
        for (const agent of agents) {
          if (agent.status !== "collaborating" || !agent.collaboratingWith) continue;
          for (const partnerId of agent.collaboratingWith) {
            if (agent.id >= partnerId) continue; // draw once per pair
            const a = posRef.current[agent.id];
            const b = posRef.current[partnerId];
            if (!a || !b) continue;
            lines.moveTo(a.x, a.y);
            lines.lineTo(b.x, b.y);
            lines.stroke({ width: 2, color: 0x2563eb, alpha: 0.5 });
          }
        }
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [agents, ready]);

  return <div ref={canvasRef} style={{ width, height }} className="rounded-xl overflow-hidden" />;
}
