import {
  Application, Container, Graphics, Text, TextStyle, Rectangle,
  Sprite as PixiSprite, Assets, Texture, AnimatedSprite,
} from "pixi.js";
import type { OfficeRenderer } from "./types";
import type { Agent, AgentStatus } from "../types";
import type { ThemeManifest, ZoneDef, ZoneType } from "../theme-types";

// ── Constants ────────────────────────────────────────────────────
const AVATAR_R = 28;
const SPRITE_DISPLAY_SIZE = 140;
const ZONE_BG = 0x1e293b;
const ZONE_BORDER = 0x334155;
const STATUS_LABELS: Record<AgentStatus, string> = {
  working: "Working",
  idle: "Idle",
  blocked: "Blocked",
  collaborating: "Collab",
};

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

function parseStatusColors(manifest: ThemeManifest | null): Record<AgentStatus, number> {
  const c = manifest?.characters?.statusBadge?.colors;
  if (!c) return { ...DEFAULT_STATUS_COLORS };
  const parse = (hex: string | undefined, fallback: number) => {
    if (!hex) return fallback;
    const cleaned = hex.replace("#", "");
    const n = parseInt(cleaned, 16);
    return isNaN(n) ? fallback : n;
  };
  return {
    working: parse(c.working, DEFAULT_STATUS_COLORS.working),
    idle: parse(c.idle, DEFAULT_STATUS_COLORS.idle),
    blocked: parse(c.blocked, DEFAULT_STATUS_COLORS.blocked),
    collaborating: parse(c.collaborating, DEFAULT_STATUS_COLORS.collaborating),
  };
}

function parseBgColor(manifest: ThemeManifest): number {
  const raw = manifest.canvas.background.color;
  if (!raw) return 0x0f172a;
  return Number(raw) || 0x0f172a;
}

function computeScale(containerW: number, containerH: number, canvasW: number, canvasH: number) {
  const scaleX = containerW / canvasW;
  const scaleY = containerH / canvasH;
  const scale = Math.max(scaleX, scaleY);
  const offsetX = (containerW - canvasW * scale) / 2;
  const offsetY = (containerH - canvasH * scale) / 2;
  return { scale, offsetX, offsetY };
}

function statusToZoneType(status: AgentStatus): ZoneType {
  if (status === "collaborating") return "meeting";
  if (status === "idle") return "lounge";
  return "work";
}

function assignSeats(
  agents: Agent[],
  zones: ZoneDef[],
): Map<string, { x: number; y: number; seatId: string }> {
  const assignments = new Map<string, { x: number; y: number; seatId: string }>();
  if (zones.length === 0) return assignments;

  const usableZones = zones.filter((z) => z.seats.length > 0);
  if (usableZones.length === 0) return assignments;

  const grouped = new Map<string, Agent[]>();
  for (const agent of agents) {
    const targetType = statusToZoneType(agent.status);
    const zone = usableZones.find((z) => z.type === targetType) ?? usableZones[0];
    const list = grouped.get(zone.id) ?? [];
    list.push(agent);
    grouped.set(zone.id, list);
  }

  for (const [zoneId, zoneAgents] of grouped) {
    const zone = usableZones.find((z) => z.id === zoneId);
    if (!zone || zone.seats.length === 0) continue;
    for (let i = 0; i < zoneAgents.length; i++) {
      const seat = zone.seats[i % zone.seats.length];
      assignments.set(zoneAgents[i].id, { x: seat.x, y: seat.y, seatId: seat.id });
    }
  }

  return assignments;
}

// ── Legacy fallback (when manifest is null) ──────────────────────

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

function agentZoneFallback(agent: Agent): "work" | "meeting" | "break" {
  if (agent.status === "collaborating") return "meeting";
  if (agent.status === "idle") return "break";
  return "work";
}

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

// ── Sprite sheet frame extraction ────────────────────────────────

interface SpriteFrameSet {
  idle: Texture[];
  working: Texture[];
  walkRight: Texture[];
  walkLeft: Texture[];
}

function extractFrames(
  sheetTexture: Texture,
  frameW: number,
  frameH: number,
): SpriteFrameSet {
  const getRow = (row: number, count: number): Texture[] => {
    const frames: Texture[] = [];
    for (let i = 0; i < count; i++) {
      const frame = new Rectangle(i * frameW, row * frameH, frameW, frameH);
      frames.push(new Texture({ source: sheetTexture.source, frame }));
    }
    return frames;
  };
  return {
    idle: getRow(0, 4),
    working: getRow(1, 4),
    walkRight: getRow(2, 4),
    walkLeft: getRow(3, 4),
  };
}

// ── Agent sprite types & helpers ─────────────────────────────────

interface AgentSprite {
  container: Container;
  animSprite?: AnimatedSprite;
  glow: Graphics;
  ring: Graphics;
  avatar: Graphics;
  emoji: Text;
  nameLabel: Text;
  statusLabel: Text;
  warnBadge: Text;
  dotsBadge: Text;
  hitArea: Graphics;
  usePixelArt: boolean;
}

function createAgentSprite(
  agent: Agent,
  onSelect: () => void,
  statusColors: Record<AgentStatus, number>,
  frameSets?: SpriteFrameSet,
): AgentSprite {
  const container = new Container();
  const usePixelArt = !!frameSets;

  const glow = new Graphics();
  glow.visible = false;
  container.addChild(glow);

  const ring = new Graphics();
  container.addChild(ring);

  const avatar = new Graphics();
  const emoji = new Text({ text: agent.emoji, style: EMOJI_STYLE });
  let animSprite: AnimatedSprite | undefined;

  if (usePixelArt && frameSets) {
    const initFrames = agent.status === "working" ? frameSets.working : frameSets.idle;
    animSprite = new AnimatedSprite(initFrames);
    animSprite.anchor.set(0.5, 1.0);
    animSprite.width = SPRITE_DISPLAY_SIZE;
    animSprite.height = SPRITE_DISPLAY_SIZE;
    animSprite.animationSpeed = agent.status === "working" ? 0.05 : 0.03;
    animSprite.play();
    container.addChild(animSprite);

    avatar.visible = false;
    emoji.visible = false;
  } else {
    const bgColor = parseInt(agent.color.replace("#", ""), 16);
    avatar.circle(0, 0, AVATAR_R);
    avatar.fill(bgColor);
    container.addChild(avatar);

    emoji.anchor.set(0.5);
    container.addChild(emoji);
  }

  const labelOffsetY = usePixelArt ? SPRITE_DISPLAY_SIZE / 2 + 6 : AVATAR_R + 14;

  const nameLabel = new Text({ text: agent.name, style: NAME_STYLE });
  nameLabel.anchor.set(0.5);
  nameLabel.y = labelOffsetY;
  container.addChild(nameLabel);

  const statusColor = statusColors[agent.status];
  const statusLabel = new Text({
    text: STATUS_LABELS[agent.status],
    style: new TextStyle({ fontFamily: "system-ui, sans-serif", fontSize: 10, fill: statusColor }),
  });
  statusLabel.anchor.set(0.5);
  statusLabel.y = labelOffsetY + 14;
  container.addChild(statusLabel);

  const hitR = usePixelArt ? SPRITE_DISPLAY_SIZE / 2 + 4 : AVATAR_R + 10;

  const warnBadge = new Text({ text: "\u26a0\ufe0f", style: WARN_STYLE });
  warnBadge.anchor.set(0.5);
  warnBadge.x = hitR - 8;
  warnBadge.y = -hitR + 8;
  warnBadge.visible = agent.status === "blocked";
  container.addChild(warnBadge);

  const dotsBadge = new Text({ text: "\u2022\u2022\u2022", style: DOTS_STYLE });
  dotsBadge.anchor.set(0.5);
  dotsBadge.x = hitR;
  dotsBadge.y = -8;
  dotsBadge.visible = agent.status === "working";
  container.addChild(dotsBadge);

  const hitAreaGfx = new Graphics();
  hitAreaGfx.circle(0, 0, hitR);
  hitAreaGfx.fill({ color: 0xffffff, alpha: 0.001 });
  hitAreaGfx.eventMode = "static";
  hitAreaGfx.cursor = "pointer";
  hitAreaGfx.on("pointerdown", onSelect);
  container.addChild(hitAreaGfx);

  return {
    container, animSprite, glow, ring, avatar, emoji,
    nameLabel, statusLabel, warnBadge, dotsBadge,
    hitArea: hitAreaGfx, usePixelArt,
  };
}

function updateAgentVisuals(
  sprite: AgentSprite,
  agent: Agent,
  isSelected: boolean,
  statusColors: Record<AgentStatus, number>,
  isWalking: boolean,
  frameSets?: SpriteFrameSet,
  walkDirX?: number,
) {
  const statusColor = statusColors[agent.status];
  const r = sprite.usePixelArt ? SPRITE_DISPLAY_SIZE / 2 + 4 : AVATAR_R;

  sprite.glow.clear();
  if (isSelected) {
    sprite.glow.circle(0, 0, r + 4);
    sprite.glow.fill({ color: statusColor, alpha: 0.2 });
    sprite.glow.visible = true;
  } else {
    sprite.glow.visible = false;
  }

  sprite.ring.clear();
  if (!sprite.usePixelArt) {
    sprite.ring.circle(0, 0, AVATAR_R + 3);
    sprite.ring.stroke({ width: 3, color: statusColor });
  }

  sprite.statusLabel.text = STATUS_LABELS[agent.status];
  sprite.statusLabel.style.fill = statusColor;

  if (sprite.usePixelArt && sprite.animSprite && frameSets) {
    let targetFrames: Texture[];
    let speed: number;
    if (isWalking) {
      targetFrames = (walkDirX !== undefined && walkDirX < 0) ? frameSets.walkLeft : frameSets.walkRight;
      speed = 0.13;
    } else if (agent.status === "working") {
      targetFrames = frameSets.working;
      speed = 0.05;
    } else {
      targetFrames = frameSets.idle;
      speed = 0.03;
    }
    if (sprite.animSprite.textures !== targetFrames) {
      sprite.animSprite.textures = targetFrames;
      sprite.animSprite.animationSpeed = speed;
      sprite.animSprite.play();
    }
  }

  if (isWalking) {
    sprite.container.alpha = sprite.usePixelArt ? 1.0 : 0.7;
    if (!sprite.usePixelArt) {
      sprite.dotsBadge.text = "\ud83d\udeb6";
      sprite.dotsBadge.visible = true;
    } else {
      sprite.dotsBadge.visible = false;
    }
    sprite.warnBadge.visible = false;
  } else {
    sprite.container.alpha = 1.0;
    sprite.warnBadge.visible = agent.status === "blocked";
    if (!sprite.usePixelArt) {
      sprite.dotsBadge.text = "\u2022\u2022\u2022";
      sprite.dotsBadge.visible = agent.status === "working";
    } else {
      sprite.dotsBadge.visible = false;
    }
  }
}

// ── PixiRenderer ────────────────────────────────────────────────

export class PixiRenderer implements OfficeRenderer {
  private app: Application | null = null;
  private manifest: ThemeManifest | null = null;
  private themeId?: string;
  private width = 0;
  private height = 0;

  // Layer containers
  private root: Container | null = null;
  private layerMap = new Map<string, Container>();
  private zoneContainer: Container | null = null;
  private agentContainer: Container | null = null;
  private linesGraphics: Graphics | null = null;

  // Agent state
  private sprites = new Map<string, AgentSprite>();
  private pos: Record<string, { x: number; y: number }> = {};
  private target: Record<string, { x: number; y: number }> = {};
  private agents: Agent[] = [];
  private selectedAgentId: string | null = null;

  // Animation / visuals
  private statusColors: Record<AgentStatus, number> = { ...DEFAULT_STATUS_COLORS };
  private frameSets?: SpriteFrameSet;
  private bgLoaded = false;
  private loadedAssetUrls: string[] = [];
  private walking = new Set<string>();
  private prevSeat = new Map<string, string>();
  private animId = 0;

  // Callback
  onAgentClick?: (agentId: string) => void;

  private get useFallback() {
    return this.manifest === null;
  }

  // ── init ──────────────────────────────────────────────────────

  async init(
    container: HTMLDivElement,
    width: number,
    height: number,
    manifest: ThemeManifest | null,
    themeId?: string,
  ): Promise<void> {
    this.manifest = manifest;
    this.themeId = themeId;
    this.width = width;
    this.height = height;
    this.statusColors = parseStatusColors(manifest);

    const bgColor = manifest ? parseBgColor(manifest) : 0x0f172a;
    const app = new Application();

    await app.init({
      width,
      height,
      backgroundColor: bgColor,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    if (!app.canvas) throw new Error("PixiJS canvas init failed");

    container.appendChild(app.canvas);
    this.app = app;
    app.stage.eventMode = "static";
    app.stage.hitArea = new Rectangle(0, 0, width, height);

    if (!this.useFallback && manifest) {
      await this.initThemeMode(app, manifest);
    } else {
      this.initFallbackMode(app);
    }

    this.startAnimationLoop();
  }

  private async initThemeMode(app: Application, manifest: ThemeManifest) {
    const root = new Container();
    app.stage.addChild(root);
    this.root = root;

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
    this.layerMap = map;

    const { scale, offsetX, offsetY } = computeScale(
      this.width, this.height, manifest.canvas.width, manifest.canvas.height,
    );
    root.scale.set(scale);
    root.x = offsetX;
    root.y = offsetY;

    // Background image
    const bgLayer = map.get("background");
    const hasBgImage = !!manifest.canvas?.background?.image;
    if (bgLayer && hasBgImage && this.themeId) {
      try {
        const bgUrl = `/themes/${this.themeId}/${manifest.canvas.background.image}`;
        const texture = await Assets.load(bgUrl);
        this.loadedAssetUrls.push(bgUrl);
        const bgSprite = new PixiSprite(texture);
        bgSprite.width = manifest.canvas.width;
        bgSprite.height = manifest.canvas.height;
        bgLayer.addChild(bgSprite);
        this.bgLoaded = true;
      } catch (err) {
        console.warn("[PixiRenderer] Failed to load background image:", err);
        this.bgLoaded = false;
      }
    }

    // Load sprite sheet
    const hasAtlas = !!manifest.characters?.atlas;
    if (hasAtlas && this.themeId) {
      try {
        const atlasUrl = `/themes/${this.themeId}/${manifest.characters.atlas}`;
        const sheetTexture = await Assets.load(atlasUrl);
        this.loadedAssetUrls.push(atlasUrl);
        this.frameSets = extractFrames(
          sheetTexture,
          manifest.characters.frameWidth,
          manifest.characters.frameHeight,
        );
      } catch (err) {
        console.warn("[PixiRenderer] Failed to load sprite sheet:", err);
      }
    }

    // Collaboration lines
    const effectsLayer = map.get("effects");
    if (effectsLayer) {
      const lines = new Graphics();
      effectsLayer.addChild(lines);
      this.linesGraphics = lines;
    }

    this.drawZones();
  }

  private initFallbackMode(app: Application) {
    const zoneContainer = new Container();
    const agentContainer = new Container();
    const linesGfx = new Graphics();
    app.stage.addChild(zoneContainer);
    app.stage.addChild(linesGfx);
    app.stage.addChild(agentContainer);
    this.zoneContainer = zoneContainer;
    this.agentContainer = agentContainer;
    this.linesGraphics = linesGfx;

    this.drawZones();
  }

  // ── destroy ───────────────────────────────────────────────────

  destroy(): void {
    cancelAnimationFrame(this.animId);

    for (const [, sprite] of this.sprites) {
      try {
        if (sprite.animSprite) sprite.animSprite.stop();
        sprite.container.destroy({ children: true });
      } catch { /* noop */ }
    }
    this.sprites.clear();

    for (const url of this.loadedAssetUrls) {
      try { Assets.unload(url); } catch { /* noop */ }
    }
    this.loadedAssetUrls = [];

    try { this.app?.destroy(true, { children: true }); } catch { /* noop */ }

    this.app = null;
    this.root = null;
    this.layerMap = new Map();
    this.zoneContainer = null;
    this.agentContainer = null;
    this.linesGraphics = null;
    this.frameSets = undefined;
    this.bgLoaded = false;
    this.walking.clear();
    this.prevSeat.clear();
    this.pos = {};
    this.target = {};
  }

  // ── resize ────────────────────────────────────────────────────

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    const app = this.app;
    if (!app?.renderer) return;
    app.renderer.resize(width, height);
    if (app.canvas) {
      (app.canvas as HTMLCanvasElement).style.width = `${width}px`;
      (app.canvas as HTMLCanvasElement).style.height = `${height}px`;
    }
    if (app.stage) {
      app.stage.hitArea = new Rectangle(0, 0, width, height);
    }

    if (!this.useFallback && this.manifest && this.root) {
      const { scale, offsetX, offsetY } = computeScale(
        width, height, this.manifest.canvas.width, this.manifest.canvas.height,
      );
      this.root.scale.set(scale);
      this.root.x = offsetX;
      this.root.y = offsetY;
    }

    this.drawZones();
    this.computePositions();
  }

  // ── updateAgents ──────────────────────────────────────────────

  updateAgents(agents: Agent[]): void {
    this.agents = agents;
    this.syncSprites();
    this.computePositions();
    this.updateAllVisuals();
  }

  // ── selectAgent ───────────────────────────────────────────────

  selectAgent(agentId: string | null): void {
    this.selectedAgentId = agentId;
    this.updateAllVisuals();
  }

  // ── Private: draw zones ───────────────────────────────────────

  private drawZones() {
    const manifest = this.manifest;

    if (!this.useFallback && manifest) {
      const bgLayer = this.layerMap.get("background");
      const uiLayer = this.layerMap.get("ui-overlay");
      if (!bgLayer || !uiLayer) return;

      if (!this.bgLoaded) bgLayer.removeChildren();
      uiLayer.removeChildren();

      for (const zone of manifest.zones) {
        const { x, y, width: zw, height: zh } = zone.bounds;

        if (!this.bgLoaded) {
          const g = new Graphics();
          g.roundRect(x, y, zw, zh, 12);
          g.fill(ZONE_BG);
          g.roundRect(x, y, zw, zh, 12);
          g.stroke({ width: 1, color: ZONE_BORDER });
          bgLayer.addChild(g);
        }

        const label = new Text({
          text: zone.name,
          style: new TextStyle({
            fontFamily: "system-ui, sans-serif",
            fontSize: 13,
            fontWeight: "600",
            fill: this.bgLoaded ? 0xffffff : 0x64748b,
            letterSpacing: 1,
            dropShadow: this.bgLoaded ? {
              alpha: 0.8,
              angle: Math.PI / 2,
              blur: 4,
              color: 0x000000,
              distance: 1,
            } : undefined,
          }),
        });
        label.anchor.set(0.5, 0);
        label.x = x + zw / 2;
        label.y = y + 8;
        if (this.bgLoaded) label.alpha = 0.85;
        uiLayer.addChild(label);
      }
    } else {
      const container = this.zoneContainer;
      if (!container) return;
      container.removeChildren();
      const zones = calcZonesFallback(this.width, this.height);
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
  }

  // ── Private: sync sprites ─────────────────────────────────────

  private syncSprites() {
    const agentContainer = this.useFallback
      ? this.agentContainer
      : this.layerMap.get("characters");
    if (!agentContainer) return;

    const currentIds = new Set(this.agents.map((a) => a.id));
    const sprites = this.sprites;

    // Remove stale
    for (const [id, sprite] of sprites) {
      if (!currentIds.has(id)) {
        agentContainer.removeChild(sprite.container);
        sprite.container.destroy({ children: true });
        sprites.delete(id);
      }
    }

    // Create new
    for (const agent of this.agents) {
      if (!sprites.has(agent.id)) {
        const sprite = createAgentSprite(
          agent,
          () => this.onAgentClick?.(agent.id),
          this.statusColors,
          this.frameSets,
        );
        sprites.set(agent.id, sprite);
        agentContainer.addChild(sprite.container);
      }
    }
  }

  // ── Private: compute positions ────────────────────────────────

  private computePositions() {
    if (!this.useFallback && this.manifest) {
      const seatMap = assignSeats(this.agents, this.manifest.zones);

      for (const [agentId, { x, y, seatId }] of seatMap) {
        const prevSeatId = this.prevSeat.get(agentId);
        if (prevSeatId !== undefined && prevSeatId !== seatId) {
          this.walking.add(agentId);
        }
        this.target[agentId] = { x, y };
        if (!this.pos[agentId]) {
          this.pos[agentId] = { x, y };
        }
        this.prevSeat.set(agentId, seatId);
      }
    } else {
      const zones = calcZonesFallback(this.width, this.height);
      const grouped: Record<string, Agent[]> = { work: [], meeting: [], break: [] };
      for (const a of this.agents) grouped[agentZoneFallback(a)].push(a);

      for (const [zoneKey, zoneAgents] of Object.entries(grouped)) {
        const zone = zones[zoneKey as keyof typeof zones];
        zoneAgents.forEach((agent, idx) => {
          const t = agentSlotPosFallback(idx, zoneAgents.length, zone);
          this.target[agent.id] = t;
          if (!this.pos[agent.id]) {
            this.pos[agent.id] = { ...t };
          }
        });
      }
    }
  }

  // ── Private: update all visuals ───────────────────────────────

  private updateAllVisuals() {
    for (const agent of this.agents) {
      const sprite = this.sprites.get(agent.id);
      if (sprite) {
        const isWalk = this.walking.has(agent.id);
        const walkDirX = isWalk
          ? (this.target[agent.id]?.x ?? 0) - (this.pos[agent.id]?.x ?? 0)
          : undefined;
        updateAgentVisuals(
          sprite, agent, agent.id === this.selectedAgentId,
          this.statusColors, isWalk, this.frameSets, walkDirX,
        );
      }
    }
  }

  // ── Private: animation loop ───────────────────────────────────

  private startAnimationLoop() {
    const tick = () => {
      for (const [id, t] of Object.entries(this.target)) {
        const cur = this.pos[id];
        if (!cur) continue;
        cur.x += (t.x - cur.x) * 0.15;
        cur.y += (t.y - cur.y) * 0.15;

        if (this.walking.has(id)) {
          const dx = Math.abs(t.x - cur.x);
          const dy = Math.abs(t.y - cur.y);
          if (dx < 1 && dy < 1) {
            this.walking.delete(id);
            cur.x = t.x;
            cur.y = t.y;
            const sprite = this.sprites.get(id);
            const agent = this.agents.find((a) => a.id === id);
            if (sprite && agent) {
              updateAgentVisuals(
                sprite, agent, agent.id === this.selectedAgentId,
                this.statusColors, false, this.frameSets,
              );
            }
          }
        }

        const sprite = this.sprites.get(id);
        if (sprite) {
          sprite.container.x = cur.x;
          sprite.container.y = cur.y;
        }
      }

      // Collaboration lines
      const lines = this.linesGraphics;
      if (lines) {
        lines.clear();
        for (const agent of this.agents) {
          if (agent.status !== "collaborating" || !agent.collaboratingWith) continue;
          for (const partnerId of agent.collaboratingWith) {
            if (agent.id >= partnerId) continue;
            const a = this.pos[agent.id];
            const b = this.pos[partnerId];
            if (!a || !b) continue;
            lines.moveTo(a.x, a.y);
            lines.lineTo(b.x, b.y);
            lines.stroke({ width: 2, color: 0x2563eb, alpha: 0.5 });
          }
        }
      }

      this.animId = requestAnimationFrame(tick);
    };

    this.animId = requestAnimationFrame(tick);
  }
}
