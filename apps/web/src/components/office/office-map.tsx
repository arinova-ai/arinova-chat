"use client";

import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics, Text, TextStyle, Rectangle } from "pixi.js";
import type { Agent, AgentStatus } from "./types";
import type { ThemeManifest, ZoneDef, ZoneType } from "./theme-types";

// ── Constants ────────────────────────────────────────────────────
const AVATAR_R = 28;
const ZONE_BG = 0x1e293b;
const ZONE_BORDER = 0x334155;
const STATUS_LABELS: Record<AgentStatus, string> = {
  working: "Working",
  idle: "Idle",
  blocked: "Blocked",
  collaborating: "Collab",
};

// Fallback status colors (used when manifest is null)
const DEFAULT_STATUS_COLORS: Record<AgentStatus, number> = {
  working: 0x16a34a,
  idle: 0xf59e0b,
  blocked: 0xdc2626,
  collaborating: 0x2563eb,
};

// ── Reusable text styles ─────────────────────────────────────────
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

// ── Manifest helpers ─────────────────────────────────────────────

/** Parse hex color strings from manifest into numbers */
function parseStatusColors(manifest: ThemeManifest): Record<AgentStatus, number> {
  const c = manifest.characters.statusBadge.colors;
  const parse = (hex: string, fallback: number) => {
    const cleaned = hex.replace("#", "");
    const n = parseInt(cleaned, 16);
    return isNaN(n) ? fallback : n;
  };
  return {
    working: parse(c.working ?? "", DEFAULT_STATUS_COLORS.working),
    idle: parse(c.idle ?? "", DEFAULT_STATUS_COLORS.idle),
    blocked: parse(c.blocked ?? "", DEFAULT_STATUS_COLORS.blocked),
    collaborating: parse(c.collaborating ?? "", DEFAULT_STATUS_COLORS.collaborating),
  };
}

/** Parse background color from manifest */
function parseBgColor(manifest: ThemeManifest): number {
  const raw = manifest.canvas.background.color;
  if (!raw) return 0x0f172a;
  return Number(raw) || 0x0f172a;
}

/** Compute uniform scale + offset to fit canvas into container */
function computeScale(containerW: number, containerH: number, canvasW: number, canvasH: number) {
  const scaleX = containerW / canvasW;
  const scaleY = containerH / canvasH;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (containerW - canvasW * scale) / 2;
  const offsetY = (containerH - canvasH * scale) / 2;
  return { scale, offsetX, offsetY };
}

/** Map AgentStatus → ZoneType for seat assignment */
function statusToZoneType(status: AgentStatus): ZoneType {
  if (status === "collaborating") return "meeting";
  if (status === "idle") return "lounge";
  return "work";
}

/** Assign agents to specific seats from the manifest */
function assignSeats(
  agents: Agent[],
  zones: ZoneDef[],
): Map<string, { x: number; y: number; seatId: string }> {
  const assignments = new Map<string, { x: number; y: number; seatId: string }>();

  // Group agents by target zone type
  const grouped = new Map<string, Agent[]>();
  for (const agent of agents) {
    const targetType = statusToZoneType(agent.status);
    const zone = zones.find((z) => z.type === targetType) ?? zones[0];
    const list = grouped.get(zone.id) ?? [];
    list.push(agent);
    grouped.set(zone.id, list);
  }

  // Assign each agent to a seat (round-robin if overflow)
  for (const [zoneId, zoneAgents] of grouped) {
    const zone = zones.find((z) => z.id === zoneId)!;
    for (let i = 0; i < zoneAgents.length; i++) {
      const seat = zone.seats[i % zone.seats.length];
      assignments.set(zoneAgents[i].id, { x: seat.x, y: seat.y, seatId: seat.id });
    }
  }

  return assignments;
}

// ── Legacy fallback (when manifest is null) ──────────────────────
/** @deprecated — kept for fallback when theme.json fails to load */
function calcZonesFallback(cw: number, ch: number) {
  const pad = 20;
  const gap = 12;
  const totalH = ch - pad * 2 - gap;
  const topH = Math.floor(totalH * 0.65);
  const botH = totalH - topH;
  const totalW = cw - pad * 2 - gap;
  const workW = Math.floor(totalW * 0.55);
  const meetW = totalW - workW;
  return {
    work: { x: pad, y: pad, w: workW, h: topH },
    meeting: { x: pad + workW + gap, y: pad, w: meetW, h: topH },
    break: { x: pad, y: pad + topH + gap, w: cw - pad * 2, h: botH },
  };
}

/** @deprecated */
function agentZoneFallback(agent: Agent): "work" | "meeting" | "break" {
  if (agent.status === "collaborating") return "meeting";
  if (agent.status === "idle") return "break";
  return "work";
}

/** @deprecated */
function agentSlotPosFallback(idx: number, count: number, zone: { x: number; y: number; w: number; h: number }) {
  const minSpacing = AVATAR_R * 2 + 16;
  const maxH = Math.max(1, Math.floor((zone.w - 40) / minSpacing));
  if (count <= maxH) {
    const spacing = Math.min(90, (zone.w - 40) / Math.max(count, 1));
    const totalW = spacing * (count - 1);
    const startX = zone.x + zone.w / 2 - totalW / 2;
    return { x: startX + idx * spacing, y: zone.y + zone.h / 2 };
  }
  const cols = maxH;
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

// ── Agent sprite types & helpers ─────────────────────────────────

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

function createAgentSprite(
  agent: Agent,
  onSelect: () => void,
  statusColors: Record<AgentStatus, number>,
): AgentSprite {
  const container = new Container();

  const glow = new Graphics();
  glow.visible = false;
  container.addChild(glow);

  const ring = new Graphics();
  container.addChild(ring);

  const avatar = new Graphics();
  const bgColor = parseInt(agent.color.replace("#", ""), 16);
  avatar.circle(0, 0, AVATAR_R);
  avatar.fill(bgColor);
  container.addChild(avatar);

  const emoji = new Text({ text: agent.emoji, style: EMOJI_STYLE });
  emoji.anchor.set(0.5);
  container.addChild(emoji);

  const nameLabel = new Text({ text: agent.name, style: NAME_STYLE });
  nameLabel.anchor.set(0.5);
  nameLabel.y = AVATAR_R + 14;
  container.addChild(nameLabel);

  const statusColor = statusColors[agent.status];
  const statusLabel = new Text({
    text: STATUS_LABELS[agent.status],
    style: new TextStyle({ fontFamily: "system-ui, sans-serif", fontSize: 10, fill: statusColor }),
  });
  statusLabel.anchor.set(0.5);
  statusLabel.y = AVATAR_R + 28;
  container.addChild(statusLabel);

  const warnBadge = new Text({ text: "\u26a0\ufe0f", style: WARN_STYLE });
  warnBadge.anchor.set(0.5);
  warnBadge.x = AVATAR_R - 4;
  warnBadge.y = -AVATAR_R + 4;
  warnBadge.visible = agent.status === "blocked";
  container.addChild(warnBadge);

  const dotsBadge = new Text({ text: "\u2022\u2022\u2022", style: DOTS_STYLE });
  dotsBadge.anchor.set(0.5);
  dotsBadge.x = AVATAR_R + 12;
  dotsBadge.y = -8;
  dotsBadge.visible = agent.status === "working";
  container.addChild(dotsBadge);

  const hitAreaGfx = new Graphics();
  hitAreaGfx.circle(0, 0, AVATAR_R + 10);
  hitAreaGfx.fill({ color: 0xffffff, alpha: 0.001 });
  hitAreaGfx.eventMode = "static";
  hitAreaGfx.cursor = "pointer";
  hitAreaGfx.on("pointerdown", onSelect);
  container.addChild(hitAreaGfx);

  return { container, glow, ring, avatar, emoji, nameLabel, statusLabel, warnBadge, dotsBadge, hitArea: hitAreaGfx };
}

function updateAgentVisuals(
  sprite: AgentSprite,
  agent: Agent,
  isSelected: boolean,
  statusColors: Record<AgentStatus, number>,
  isWalking: boolean,
) {
  const statusColor = statusColors[agent.status];

  sprite.glow.clear();
  if (isSelected) {
    sprite.glow.circle(0, 0, AVATAR_R + 8);
    sprite.glow.fill({ color: statusColor, alpha: 0.2 });
    sprite.glow.visible = true;
  } else {
    sprite.glow.visible = false;
  }

  sprite.ring.clear();
  sprite.ring.circle(0, 0, AVATAR_R + 3);
  sprite.ring.stroke({ width: 3, color: statusColor });

  sprite.statusLabel.text = STATUS_LABELS[agent.status];
  sprite.statusLabel.style.fill = statusColor;

  // Walking state visual
  if (isWalking) {
    sprite.container.alpha = 0.7;
    sprite.dotsBadge.text = "\ud83d\udeb6";
    sprite.dotsBadge.visible = true;
    sprite.warnBadge.visible = false;
  } else {
    sprite.container.alpha = 1.0;
    sprite.warnBadge.visible = agent.status === "blocked";
    sprite.dotsBadge.text = "\u2022\u2022\u2022";
    sprite.dotsBadge.visible = agent.status === "working";
  }
}

// ── Component ────────────────────────────────────────────────────

interface Props {
  agents: Agent[];
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
  width: number;
  height: number;
  manifest?: ThemeManifest | null;
}

export default function OfficeMap({
  agents,
  selectedAgentId,
  onSelectAgent,
  width,
  height,
  manifest = null,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const [ready, setReady] = useState(false);

  // Layer & display refs
  const rootRef = useRef<Container | null>(null);
  const layerMapRef = useRef<Map<string, Container>>(new Map());
  // Fallback refs (used only when manifest is null)
  const zoneContainerRef = useRef<Container | null>(null);
  const agentContainerRef = useRef<Container | null>(null);
  const linesGraphicsRef = useRef<Graphics | null>(null);

  const spritesRef = useRef<Map<string, AgentSprite>>(new Map());
  const posRef = useRef<Record<string, { x: number; y: number }>>({});
  const targetRef = useRef<Record<string, { x: number; y: number }>>({});
  const statusColorsRef = useRef<Record<AgentStatus, number>>(DEFAULT_STATUS_COLORS);

  // Walking animation tracking
  const walkingRef = useRef<Set<string>>(new Set());
  const prevSeatRef = useRef<Map<string, string>>(new Map());

  const useFallback = manifest === null;

  // Update status colors when manifest changes
  useEffect(() => {
    statusColorsRef.current = manifest ? parseStatusColors(manifest) : DEFAULT_STATUS_COLORS;
  }, [manifest]);

  // ── Init PixiJS ──────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return;

    const bgColor = manifest ? parseBgColor(manifest) : 0x0f172a;
    const app = new Application();
    appRef.current = app;
    setReady(false);

    app
      .init({
        width,
        height,
        backgroundColor: bgColor,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })
      .then(() => {
        if (appRef.current !== app) return;
        if (!canvasRef.current || !app.canvas) return;

        canvasRef.current.appendChild(app.canvas);
        app.stage.eventMode = "static";
        app.stage.hitArea = new Rectangle(0, 0, width, height);

        if (!useFallback && manifest) {
          // ── Theme-driven: root container with scaling ──
          const root = new Container();
          app.stage.addChild(root);
          rootRef.current = root;

          // Create layer containers from manifest
          const layers = [...manifest.layers].sort((a, b) => a.zIndex - b.zIndex);
          const map = new Map<string, Container>();
          for (const layer of layers) {
            const c = new Container();
            c.zIndex = layer.zIndex;
            c.label = layer.id;
            root.addChild(c);
            map.set(layer.id, c);
          }
          root.sortableChildren = true;
          layerMapRef.current = map;

          // Apply initial scale
          const { scale, offsetX, offsetY } = computeScale(
            width, height, manifest.canvas.width, manifest.canvas.height,
          );
          root.scale.set(scale);
          root.x = offsetX;
          root.y = offsetY;

          // Also store collaboration lines in effects layer
          const effectsLayer = map.get("effects");
          if (effectsLayer) {
            const lines = new Graphics();
            effectsLayer.addChild(lines);
            linesGraphicsRef.current = lines;
          }
        } else {
          // ── Fallback: old ad-hoc containers ──
          const zoneContainer = new Container();
          const agentContainer = new Container();
          const linesGfx = new Graphics();
          app.stage.addChild(zoneContainer);
          app.stage.addChild(linesGfx);
          app.stage.addChild(agentContainer);
          zoneContainerRef.current = zoneContainer;
          agentContainerRef.current = agentContainer;
          linesGraphicsRef.current = linesGfx;
        }

        setReady(true);
      });

    return () => {
      appRef.current = null;
      rootRef.current = null;
      layerMapRef.current = new Map();
      zoneContainerRef.current = null;
      agentContainerRef.current = null;
      linesGraphicsRef.current = null;
      spritesRef.current.clear();
      walkingRef.current.clear();
      prevSeatRef.current.clear();
      try { app.destroy(true); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest]);

  // ── Resize ─────────────────────────────────────────────────
  useEffect(() => {
    const app = appRef.current;
    if (!app || !ready) return;
    app.renderer.resize(width, height);
    if (app.canvas) {
      (app.canvas as HTMLCanvasElement).style.width = `${width}px`;
      (app.canvas as HTMLCanvasElement).style.height = `${height}px`;
    }
    app.stage.hitArea = new Rectangle(0, 0, width, height);

    // Update root container scale for theme-driven mode
    if (!useFallback && manifest && rootRef.current) {
      const { scale, offsetX, offsetY } = computeScale(
        width, height, manifest.canvas.width, manifest.canvas.height,
      );
      rootRef.current.scale.set(scale);
      rootRef.current.x = offsetX;
      rootRef.current.y = offsetY;
    }
  }, [width, height, ready, manifest, useFallback]);

  // ── Draw zones ─────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;

    if (!useFallback && manifest) {
      // Theme-driven: draw zones from manifest into background + ui-overlay layers
      const bgLayer = layerMapRef.current.get("background");
      const uiLayer = layerMapRef.current.get("ui-overlay");
      if (!bgLayer || !uiLayer) return;

      // Clear previous zone graphics (in case manifest changed)
      bgLayer.removeChildren();
      uiLayer.removeChildren();

      for (const zone of manifest.zones) {
        const { x, y, width: zw, height: zh } = zone.bounds;
        const g = new Graphics();
        g.roundRect(x, y, zw, zh, 12);
        g.fill(ZONE_BG);
        g.roundRect(x, y, zw, zh, 12);
        g.stroke({ width: 1, color: ZONE_BORDER });
        bgLayer.addChild(g);

        const label = new Text({ text: zone.name, style: LABEL_STYLE });
        label.x = x + 12;
        label.y = y + 8;
        uiLayer.addChild(label);
      }
    } else {
      // Fallback: draw zones from calcZones
      const container = zoneContainerRef.current;
      if (!container) return;
      container.removeChildren();
      const zones = calcZonesFallback(width, height);
      const labels: Record<string, string> = {
        work: "WORK AREA",
        meeting: "MEETING ROOM",
        break: "BREAK AREA  \u2615",
      };
      for (const [key, zone] of Object.entries(zones)) {
        const g = new Graphics();
        g.roundRect(zone.x, zone.y, zone.w, zone.h, 12);
        g.fill(ZONE_BG);
        g.roundRect(zone.x, zone.y, zone.w, zone.h, 12);
        g.stroke({ width: 1, color: ZONE_BORDER });
        container.addChild(g);
        const label = new Text({ text: labels[key], style: LABEL_STYLE });
        label.x = zone.x + 12;
        label.y = zone.y + 8;
        container.addChild(label);
      }
    }
  }, [width, height, ready, manifest, useFallback]);

  // ── Sync agent sprites ─────────────────────────────────────
  useEffect(() => {
    if (!ready) return;

    // Find the agent container (theme-driven: characters layer; fallback: agentContainerRef)
    const agentContainer = useFallback
      ? agentContainerRef.current
      : layerMapRef.current.get("characters");
    if (!agentContainer) return;

    const currentIds = new Set(agents.map((a) => a.id));
    const sprites = spritesRef.current;
    const colors = statusColorsRef.current;

    // Remove stale sprites
    for (const [id, sprite] of sprites) {
      if (!currentIds.has(id)) {
        agentContainer.removeChild(sprite.container);
        sprite.container.destroy({ children: true });
        sprites.delete(id);
      }
    }

    // Create new sprites
    for (const agent of agents) {
      if (!sprites.has(agent.id)) {
        const sprite = createAgentSprite(agent, () => onSelectAgent(agent.id), colors);
        sprites.set(agent.id, sprite);
        agentContainer.addChild(sprite.container);
      }
    }
  }, [agents, onSelectAgent, ready, useFallback]);

  // ── Update visuals ─────────────────────────────────────────
  useEffect(() => {
    const sprites = spritesRef.current;
    const colors = statusColorsRef.current;
    const walking = walkingRef.current;
    for (const agent of agents) {
      const sprite = sprites.get(agent.id);
      if (sprite) {
        updateAgentVisuals(sprite, agent, agent.id === selectedAgentId, colors, walking.has(agent.id));
      }
    }
  }, [agents, selectedAgentId]);

  // ── Compute target positions ───────────────────────────────
  useEffect(() => {
    if (!ready) return;

    if (!useFallback && manifest) {
      // Theme-driven: assign seats from manifest
      const seatMap = assignSeats(agents, manifest.zones);
      const prevSeats = prevSeatRef.current;

      for (const [agentId, { x, y, seatId }] of seatMap) {
        const prevSeatId = prevSeats.get(agentId);
        // Detect seat change → mark as walking
        if (prevSeatId !== undefined && prevSeatId !== seatId) {
          walkingRef.current.add(agentId);
        }
        targetRef.current[agentId] = { x, y };
        if (!posRef.current[agentId]) {
          posRef.current[agentId] = { x, y };
        }
        prevSeats.set(agentId, seatId);
      }
    } else {
      // Fallback: compute from zones
      const zones = calcZonesFallback(width, height);
      const grouped: Record<string, Agent[]> = { work: [], meeting: [], break: [] };
      for (const a of agents) grouped[agentZoneFallback(a)].push(a);

      for (const [zoneKey, zoneAgents] of Object.entries(grouped)) {
        const zone = zones[zoneKey as keyof typeof zones];
        zoneAgents.forEach((agent, idx) => {
          const target = agentSlotPosFallback(idx, zoneAgents.length, zone);
          targetRef.current[agent.id] = target;
          if (!posRef.current[agent.id]) {
            posRef.current[agent.id] = { ...target };
          }
        });
      }
    }
  }, [agents, width, height, ready, manifest, useFallback]);

  // ── Animation tick ─────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;

    let animId: number;
    const tick = () => {
      const sprites = spritesRef.current;
      const lines = linesGraphicsRef.current;
      const walking = walkingRef.current;
      const colors = statusColorsRef.current;

      // Lerp positions
      for (const [id, target] of Object.entries(targetRef.current)) {
        const cur = posRef.current[id];
        if (!cur) continue;
        cur.x += (target.x - cur.x) * 0.15;
        cur.y += (target.y - cur.y) * 0.15;

        // Check arrival (within 1px)
        if (walking.has(id)) {
          const dx = Math.abs(target.x - cur.x);
          const dy = Math.abs(target.y - cur.y);
          if (dx < 1 && dy < 1) {
            walking.delete(id);
            cur.x = target.x;
            cur.y = target.y;
            // Restore normal visuals
            const sprite = sprites.get(id);
            const agent = agents.find((a) => a.id === id);
            if (sprite && agent) {
              updateAgentVisuals(sprite, agent, agent.id === selectedAgentId, colors, false);
            }
          }
        }

        const sprite = sprites.get(id);
        if (sprite) {
          sprite.container.x = cur.x;
          sprite.container.y = cur.y;
        }
      }

      // Collaboration lines
      if (lines) {
        lines.clear();
        for (const agent of agents) {
          if (agent.status !== "collaborating" || !agent.collaboratingWith) continue;
          for (const partnerId of agent.collaboratingWith) {
            if (agent.id >= partnerId) continue;
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
  }, [agents, ready, selectedAgentId]);

  return <div ref={canvasRef} style={{ width, height }} className="rounded-xl overflow-hidden" />;
}
