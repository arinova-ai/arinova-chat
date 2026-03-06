import type { OfficeRenderer } from "./types";
import type { ThemeManifest, AvgCharacterDef } from "../theme-types";
import type { Agent, AgentStatus } from "../types";

// ── Pose mapping ────────────────────────────────────────────────

/** Sprite key must match the keys in avgCharacters[].sprites (theme.json) */
type SpriteKey = string;

function statusToSpriteKey(status: AgentStatus): SpriteKey {
  switch (status) {
    case "working":
      return "working";
    case "collaborating":
      return "collaborating";
    case "idle":
      return "idle";
    case "blocked":
      return "blocked";
    default:
      return "sleeping";
  }
}

// ── Constants ───────────────────────────────────────────────────

const CANVAS_W = 1920;
const CANVAS_H = 1072;
const FRAME_INTERVAL = 500; // ms between frame A/B toggle
const MOBILE_BREAKPOINT = 768;
const MOBILE_SCALE = 1.8;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

// ── CSS (injected once) ─────────────────────────────────────────

const AVG_CSS = /* css */ `
.avg-root {
  position: relative;
  overflow: hidden;
  background: #0f172a;
  user-select: none;
  -webkit-user-select: none;
}
.avg-viewport {
  position: absolute;
  transform-origin: 0 0;
}
.avg-bg {
  display: block;
  width: 100%;
  height: 100%;
}
.avg-char-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  transition: opacity 0.3s ease;
}
.avg-char-layer img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.15s ease;
}
.avg-hotspot {
  position: absolute;
  cursor: pointer;
  z-index: 10;
}
.avg-hotspot:hover {
  background: rgba(255,255,255,0.08);
  border-radius: 8px;
}
.avg-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid rgba(0,0,0,0.5);
  pointer-events: none;
}
.avg-name {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: #fff;
  background: rgba(0,0,0,0.6);
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
}
`;

let cssInjected = false;
function injectCSS() {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement("style");
  style.textContent = AVG_CSS;
  document.head.appendChild(style);
}

// ── Badge color ─────────────────────────────────────────────────

function statusColor(status: AgentStatus): string {
  switch (status) {
    case "working": return "#22c55e";
    case "idle": return "#eab308";
    case "blocked": return "#ef4444";
    case "collaborating": return "#3b82f6";
    default: return "#64748b";
  }
}

// ── Renderer ────────────────────────────────────────────────────

export class AvgRenderer implements OfficeRenderer {
  // ── Callbacks ───────────────────────────────────────────────
  onAgentClick?: (agentId: string) => void;
  onCharacterClick?: () => void;
  onSlotClick?: (slotIndex: number) => void;

  // ── DOM ─────────────────────────────────────────────────────
  private root: HTMLDivElement | null = null;
  private viewport: HTMLDivElement | null = null;
  private charDefs: AvgCharacterDef[] = [];
  private themeBase = "";

  // ── Per-character DOM refs ──────────────────────────────────
  private charLayers: Map<number, { frameA: HTMLImageElement; frameB: HTMLImageElement; layer: HTMLDivElement }> = new Map();
  private hotspots: Map<number, HTMLDivElement> = new Map();
  private badges: Map<number, HTMLDivElement> = new Map();
  private nameLabels: Map<number, HTMLDivElement> = new Map();

  // ── State ──────────────────────────────────────────────────
  private agents: Agent[] = [];
  private bindings: Map<number, string> = new Map(); // slotIndex → agentId
  private currentPoses: Map<number, SpriteKey> = new Map();
  private showingFrameA = true;
  private frameTimer: ReturnType<typeof setInterval> | null = null;

  // ── Viewport ───────────────────────────────────────────────
  private containerW = 0;
  private containerH = 0;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  // ── Mobile pan/zoom ────────────────────────────────────────
  private panStartX = 0;
  private panStartY = 0;
  private panOffsetX = 0;
  private panOffsetY = 0;
  private pinchStartDist = 0;
  private pinchStartScale = 1;
  private boundTouchStart: ((e: TouchEvent) => void) | null = null;
  private boundTouchMove: ((e: TouchEvent) => void) | null = null;
  private boundTouchEnd: (() => void) | null = null;

  // ── Init ───────────────────────────────────────────────────

  async init(
    container: HTMLDivElement,
    width: number,
    height: number,
    manifest: ThemeManifest | null,
    themeId?: string,
  ): Promise<void> {
    injectCSS();

    this.containerW = width;
    this.containerH = height;
    this.charDefs = manifest?.avgCharacters ?? [];
    this.themeBase = themeId ? `/themes/${themeId}` : "";

    // Root container
    const root = document.createElement("div");
    root.className = "avg-root";
    root.style.width = `${width}px`;
    root.style.height = `${height}px`;
    this.root = root;

    // Viewport (scaled scene)
    const vp = document.createElement("div");
    vp.className = "avg-viewport";
    vp.style.width = `${CANVAS_W}px`;
    vp.style.height = `${CANVAS_H}px`;
    this.viewport = vp;
    root.appendChild(vp);

    // Background
    const bg = document.createElement("img");
    bg.className = "avg-bg";
    bg.src = `${this.themeBase}/bg.jpeg`;
    bg.draggable = false;
    vp.appendChild(bg);

    // Characters
    for (const def of this.charDefs) {
      this.createCharacter(vp, def);
    }

    container.appendChild(root);
    this.layoutViewport();
    this.startFrameLoop();
    this.setupMobileGestures();
  }

  // ── Create character DOM elements ─────────────────────────

  private createCharacter(vp: HTMLDivElement, def: AvgCharacterDef) {
    const defaultPose: SpriteKey = def.defaultSprite ?? "sleeping";

    // Character layer (two overlapping imgs for A/B frame toggle)
    const layer = document.createElement("div");
    layer.className = "avg-char-layer";
    layer.style.opacity = "0.4"; // default: sleeping (no agent)

    const frameA = document.createElement("img");
    const frameB = document.createElement("img");
    frameA.draggable = false;
    frameB.draggable = false;

    const sprites = def.sprites[defaultPose];
    if (sprites) {
      frameA.src = `${this.themeBase}/${sprites[0]}`;
      frameB.src = `${this.themeBase}/${sprites[1]}`;
    }
    frameA.style.opacity = "1";
    frameB.style.opacity = "0";

    layer.appendChild(frameA);
    layer.appendChild(frameB);
    vp.appendChild(layer);

    this.charLayers.set(def.slotIndex, { frameA, frameB, layer });
    this.currentPoses.set(def.slotIndex, defaultPose);

    // Hotspot div
    const hotspot = document.createElement("div");
    hotspot.className = "avg-hotspot";
    hotspot.style.left = `${def.hotspot.left}%`;
    hotspot.style.top = `${def.hotspot.top}%`;
    hotspot.style.width = `${def.hotspot.width}%`;
    hotspot.style.height = `${def.hotspot.height}%`;

    hotspot.addEventListener("click", () => {
      this.onSlotClick?.(def.slotIndex);
    });

    // Unread/status badge
    const badge = document.createElement("div");
    badge.className = "avg-badge";
    badge.style.background = "#64748b";
    badge.style.display = "none";
    hotspot.appendChild(badge);

    // Name label
    const nameLabel = document.createElement("div");
    nameLabel.className = "avg-name";
    nameLabel.textContent = def.name;
    hotspot.appendChild(nameLabel);

    vp.appendChild(hotspot);
    this.hotspots.set(def.slotIndex, hotspot);
    this.badges.set(def.slotIndex, badge);
    this.nameLabels.set(def.slotIndex, nameLabel);
  }

  // ── Frame animation loop ──────────────────────────────────

  private startFrameLoop() {
    this.frameTimer = setInterval(() => {
      this.showingFrameA = !this.showingFrameA;
      for (const [, { frameA, frameB }] of this.charLayers) {
        frameA.style.opacity = this.showingFrameA ? "1" : "0";
        frameB.style.opacity = this.showingFrameA ? "0" : "1";
      }
    }, FRAME_INTERVAL);
  }

  // ── Viewport layout (contain-fit) ─────────────────────────

  private layoutViewport() {
    if (!this.root || !this.viewport) return;

    const isMobile = this.containerW < MOBILE_BREAKPOINT;
    const baseScale = Math.min(
      this.containerW / CANVAS_W,
      this.containerH / CANVAS_H,
    );
    this.scale = isMobile ? baseScale * MOBILE_SCALE : baseScale;

    const scaledW = CANVAS_W * this.scale;
    const scaledH = CANVAS_H * this.scale;
    this.offsetX = (this.containerW - scaledW) / 2;
    this.offsetY = (this.containerH - scaledH) / 2;

    this.applyTransform();
  }

  private applyTransform() {
    if (!this.viewport) return;
    this.viewport.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
  }

  // ── Mobile pan/zoom gestures ──────────────────────────────

  private setupMobileGestures() {
    if (!this.root) return;

    this.boundTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        this.panStartX = e.touches[0].clientX - this.offsetX;
        this.panStartY = e.touches[0].clientY - this.offsetY;
        this.panOffsetX = this.offsetX;
        this.panOffsetY = this.offsetY;
      } else if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        this.pinchStartDist = Math.hypot(dx, dy);
        this.pinchStartScale = this.scale;
      }
    };

    this.boundTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        this.offsetX = e.touches[0].clientX - this.panStartX;
        this.offsetY = e.touches[0].clientY - this.panStartY;
        this.applyTransform();
      } else if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const dist = Math.hypot(dx, dy);
        const ratio = dist / this.pinchStartDist;
        this.scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.pinchStartScale * ratio));
        this.applyTransform();
      }
    };

    this.boundTouchEnd = () => {};

    this.root.addEventListener("touchstart", this.boundTouchStart, { passive: true });
    this.root.addEventListener("touchmove", this.boundTouchMove, { passive: false });
    this.root.addEventListener("touchend", this.boundTouchEnd);
  }

  // ── OfficeRenderer interface ──────────────────────────────

  destroy(): void {
    if (this.frameTimer) clearInterval(this.frameTimer);
    if (this.root) {
      if (this.boundTouchStart) this.root.removeEventListener("touchstart", this.boundTouchStart);
      if (this.boundTouchMove) this.root.removeEventListener("touchmove", this.boundTouchMove);
      if (this.boundTouchEnd) this.root.removeEventListener("touchend", this.boundTouchEnd);
      this.root.remove();
    }
    this.charLayers.clear();
    this.hotspots.clear();
    this.badges.clear();
    this.nameLabels.clear();
    this.root = null;
    this.viewport = null;
  }

  resize(width: number, height: number): void {
    this.containerW = width;
    this.containerH = height;
    if (this.root) {
      this.root.style.width = `${width}px`;
      this.root.style.height = `${height}px`;
    }
    this.layoutViewport();
  }

  updateAgents(agents: Agent[]): void {
    this.agents = agents;
    this.refreshCharacters();
  }

  selectAgent(_agentId: string | null): void {
    // No-op for AVG renderer — selection handled via slot click
  }

  updateBindings(bindings: { slotIndex: number; agentId: string }[]): void {
    this.bindings.clear();
    for (const b of bindings) {
      this.bindings.set(b.slotIndex, b.agentId);
    }
    this.refreshCharacters();
  }

  // ── Refresh character visuals from bindings + agent state ──

  private refreshCharacters() {
    for (const def of this.charDefs) {
      const charEl = this.charLayers.get(def.slotIndex);
      const badge = this.badges.get(def.slotIndex);
      const nameLabel = this.nameLabels.get(def.slotIndex);
      if (!charEl) continue;

      const agentId = this.bindings.get(def.slotIndex);
      const agent = agentId ? this.agents.find((a) => a.id === agentId) : undefined;

      if (agent) {
        // Bound + online agent
        const pose = statusToSpriteKey(agent.status);
        charEl.layer.style.opacity = "1";

        if (this.currentPoses.get(def.slotIndex) !== pose) {
          this.currentPoses.set(def.slotIndex, pose);
          const sprites = def.sprites[pose] ?? def.sprites["sleeping"];
          if (sprites) {
            charEl.frameA.src = `${this.themeBase}/${sprites[0]}`;
            charEl.frameB.src = `${this.themeBase}/${sprites[1]}`;
          }
        }

        if (badge) {
          badge.style.display = "block";
          badge.style.background = statusColor(agent.status);
        }
        if (nameLabel) {
          nameLabel.textContent = agent.name;
        }
      } else {
        // No agent or offline — sleeping pose with reduced opacity
        charEl.layer.style.opacity = "0.4";
        const sleepPose: SpriteKey = "sleeping";
        if (this.currentPoses.get(def.slotIndex) !== sleepPose) {
          this.currentPoses.set(def.slotIndex, sleepPose);
          const sprites = def.sprites[sleepPose];
          if (sprites) {
            charEl.frameA.src = `${this.themeBase}/${sprites[0]}`;
            charEl.frameB.src = `${this.themeBase}/${sprites[1]}`;
          }
        }

        if (badge) badge.style.display = "none";
        if (nameLabel) nameLabel.textContent = def.name;
      }
    }
  }
}
