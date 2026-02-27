import type { OfficeRenderer } from "./types";
import type { ThemeManifest, SpriteScene, SpriteOverlay } from "../theme-types";
import type { Agent, AgentStatus } from "../types";

// ── Scene key mapping ───────────────────────────────────────────

type SceneKey = "working" | "idle" | "sleeping";

function statusToScene(status: AgentStatus): SceneKey {
  switch (status) {
    case "working":
    case "collaborating":
      return "working";
    case "idle":
      return "idle";
    case "blocked":
    default:
      return "sleeping";
  }
}

// ── CSS Keyframes (injected once via <style>) ───────────────────

const SPRITE_CSS = /* css */ `
/* Thought bubble float */
@keyframes sprite-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

/* Dot bounce inside thought bubble */
@keyframes sprite-dotBounce {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.3;
  }
  30% {
    transform: translateY(-8px);
    opacity: 1;
  }
}

/* ZZZ float up and fade */
@keyframes sprite-zzzFloat {
  0% {
    opacity: 0;
    transform: translateY(0) scale(0.6);
  }
  15% {
    opacity: 1;
    transform: translateY(-5px) scale(1);
  }
  70% {
    opacity: 0.8;
    transform: translateY(-20px) scale(1.05);
  }
  100% {
    opacity: 0;
    transform: translateY(-35px) scale(0.8);
  }
}

/* Music note float */
@keyframes sprite-noteFloat {
  0% {
    opacity: 0;
    transform: translateY(0) translateX(0) rotate(0deg) scale(0.5);
  }
  10% {
    opacity: 1;
    transform: translateY(-5px) translateX(3px) rotate(-5deg) scale(1);
  }
  50% {
    opacity: 0.8;
    transform: translateY(-30px) translateX(15px) rotate(10deg) scale(1.1);
  }
  80% {
    opacity: 0.3;
    transform: translateY(-50px) translateX(25px) rotate(-5deg) scale(0.9);
  }
  100% {
    opacity: 0;
    transform: translateY(-65px) translateX(30px) rotate(15deg) scale(0.6);
  }
}

/* LED pulse (green — working) */
@keyframes sprite-ledPulseGreen {
  0%, 100% { opacity: 1; box-shadow: 0 0 8px #4eff4e, 0 0 16px rgba(78,255,78,0.4); }
  50% { opacity: 0.6; box-shadow: 0 0 4px #4eff4e, 0 0 8px rgba(78,255,78,0.2); }
}

/* LED pulse (red — sleeping/idle) */
@keyframes sprite-ledPulseRed {
  0%, 100% { opacity: 0.8; box-shadow: 0 0 6px #ff4e4e, 0 0 12px rgba(255,78,78,0.3); }
  50% { opacity: 0.3; box-shadow: 0 0 3px #ff4e4e, 0 0 6px rgba(255,78,78,0.15); }
}

/* Screen flicker */
@keyframes sprite-screenFlicker {
  0%, 100% { opacity: 0.7; }
  25% { opacity: 1; }
  50% { opacity: 0.5; }
  75% { opacity: 0.9; }
}

/* Sun ray shimmer */
@keyframes sprite-rayShimmer {
  0%, 100% { opacity: 0.6; }
  33% { opacity: 1; }
  66% { opacity: 0.7; }
}

/* Scene crossfade */
.sprite-bg-layer {
  position: absolute;
  inset: 0;
  transition: opacity 0.8s ease-in-out;
}
.sprite-bg-layer img {
  width: 100%;
  height: 100%;
  display: block;
}
`;

// ── Overlay builders ────────────────────────────────────────────

function buildThoughtBubble(ov: SpriteOverlay): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = `
    position:absolute;
    left:${ov.position[0]}%;
    top:${ov.position[1]}%;
    background:rgba(255,255,255,0.92);
    border-radius:18px;
    padding:10px 16px;
    display:flex;
    gap:6px;
    align-items:center;
    box-shadow:0 2px 12px rgba(0,0,0,0.15);
    animation:sprite-float 3s ease-in-out infinite;
    pointer-events:none;
    z-index:2;
  `;

  // Tail circles via pseudo-element workaround (inline elements)
  const tailBig = document.createElement("span");
  tailBig.style.cssText = `
    position:absolute;bottom:-12px;left:8px;
    width:14px;height:14px;border-radius:50%;
    background:rgba(255,255,255,0.92);
    box-shadow:0 1px 4px rgba(0,0,0,0.1);
  `;
  const tailSmall = document.createElement("span");
  tailSmall.style.cssText = `
    position:absolute;bottom:-22px;left:2px;
    width:8px;height:8px;border-radius:50%;
    background:rgba(255,255,255,0.92);
    box-shadow:0 1px 4px rgba(0,0,0,0.1);
  `;
  wrap.appendChild(tailBig);
  wrap.appendChild(tailSmall);

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.style.cssText = `
      width:10px;height:10px;border-radius:50%;
      background:#555;
      animation:sprite-dotBounce 1.2s ease-in-out infinite;
      animation-delay:${i * 0.2}s;
    `;
    wrap.appendChild(dot);
  }
  return wrap;
}

function buildZzz(ov: SpriteOverlay): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = `
    position:absolute;
    left:${ov.position[0]}%;
    top:${ov.position[1]}%;
    pointer-events:none;
    z-index:2;
  `;

  const sizes = [18, 24, 32];
  const offsets = [
    { left: 0, top: 0 },
    { left: 18, top: -20 },
    { left: 40, top: -48 },
  ];
  const delays = [0, 0.8, 1.6];

  for (let i = 0; i < 3; i++) {
    const z = document.createElement("span");
    z.textContent = "Z";
    z.style.cssText = `
      position:absolute;
      font-family:'Comic Sans MS','Chalkboard SE',cursive;
      font-weight:bold;
      font-size:${sizes[i]}px;
      color:rgba(255,255,255,0.85);
      text-shadow:0 1px 4px rgba(0,0,0,0.3);
      left:${offsets[i].left}px;
      top:${offsets[i].top}px;
      opacity:0;
      animation:sprite-zzzFloat 3s ease-in-out infinite;
      animation-delay:${delays[i]}s;
    `;
    wrap.appendChild(z);
  }
  return wrap;
}

function buildMusicNotes(ov: SpriteOverlay): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = `
    position:absolute;
    left:${ov.position[0]}%;
    top:${ov.position[1]}%;
    pointer-events:none;
    z-index:2;
  `;

  const notes = ["\u266A", "\u266B", "\u2669", "\u266A"];
  const sizes = [18, 24, 16, 22];
  const offsets = [
    { left: 0, top: 0 },
    { left: 20, top: -15 },
    { left: -10, top: -8 },
    { left: 30, top: -25 },
  ];
  const delays = [0, 1, 2, 3];

  for (let i = 0; i < 4; i++) {
    const n = document.createElement("span");
    n.textContent = notes[i];
    n.style.cssText = `
      position:absolute;
      font-size:${sizes[i]}px;
      color:rgba(255,220,150,0.9);
      text-shadow:0 1px 6px rgba(255,160,50,0.4);
      left:${offsets[i].left}px;
      top:${offsets[i].top}px;
      opacity:0;
      animation:sprite-noteFloat 4s ease-in-out infinite;
      animation-delay:${delays[i]}s;
    `;
    wrap.appendChild(n);
  }
  return wrap;
}

function buildLed(ov: SpriteOverlay): HTMLElement {
  const color = ov.color ?? "green";
  const isGreen = color === "green" || color === "#4eff4e";
  const el = document.createElement("div");

  const bg = isGreen
    ? "radial-gradient(circle,#4eff4e,#00cc00)"
    : "radial-gradient(circle,#ff4e4e,#cc0000)";
  const anim = isGreen ? "sprite-ledPulseGreen" : "sprite-ledPulseRed";
  const shadow = isGreen
    ? "0 0 8px #4eff4e,0 0 16px rgba(78,255,78,0.4)"
    : "0 0 6px #ff4e4e,0 0 12px rgba(255,78,78,0.3)";
  const dur = isGreen ? "2s" : "3s";
  const size = isGreen ? 24 : 18;

  el.style.cssText = `
    position:absolute;
    left:${ov.position[0]}%;
    top:${ov.position[1]}%;
    width:${size}px;height:${size}px;
    border-radius:50%;
    background:${bg};
    box-shadow:${shadow};
    animation:${anim} ${dur} ease-in-out infinite;
    pointer-events:none;
    z-index:2;
  `;
  return el;
}

function buildScreenGlow(ov: SpriteOverlay): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `
    position:absolute;
    left:${ov.position[0]}%;
    top:${ov.position[1]}%;
    width:70px;height:35px;
    background:radial-gradient(ellipse,rgba(100,200,255,0.2),transparent);
    animation:sprite-screenFlicker 3s ease-in-out infinite;
    pointer-events:none;
    z-index:2;
  `;
  return el;
}

function buildSunRays(ov: SpriteOverlay): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `
    position:absolute;
    left:${ov.position[0]}%;
    top:${ov.position[1]}%;
    width:300px;height:400px;
    background:linear-gradient(160deg,rgba(255,180,80,0.08) 0%,rgba(255,150,50,0.04) 40%,transparent 70%);
    animation:sprite-rayShimmer 6s ease-in-out infinite;
    pointer-events:none;
    z-index:1;
  `;
  return el;
}

function buildOverlay(ov: SpriteOverlay): HTMLElement {
  switch (ov.type) {
    case "thought-bubble": return buildThoughtBubble(ov);
    case "zzz": return buildZzz(ov);
    case "music-notes": return buildMusicNotes(ov);
    case "led": return buildLed(ov);
    case "screen-glow": return buildScreenGlow(ov);
    case "sun-rays": return buildSunRays(ov);
  }
}

// ── SpriteRenderer ──────────────────────────────────────────────

const MOBILE_BREAKPOINT = 768;
const MOBILE_SCALE = 2.0;

export class SpriteRenderer implements OfficeRenderer {
  onAgentClick?: (agentId: string) => void;
  onCharacterClick?: () => void;

  private container: HTMLDivElement | null = null;
  private root: HTMLDivElement | null = null;
  private viewport: HTMLDivElement | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private manifest: ThemeManifest | null = null;
  private themeId = "";

  private currentScene: SceneKey = "working";
  private bgLayers: Map<SceneKey, HTMLDivElement> = new Map();
  private overlayContainer: HTMLDivElement | null = null;
  private hitboxEl: HTMLDivElement | null = null;
  private firstAgentId: string | null = null;

  // Viewport sizing (aspect-ratio-aware)
  private canvasAspect = 16 / 9;
  private vpW = 0;
  private vpH = 0;

  // Pan / zoom state
  private isMobile = false;
  private scale = 1;
  private panX = 0;
  private panY = 0;
  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private panStartX = 0;
  private panStartY = 0;

  async init(
    container: HTMLDivElement,
    _width: number,
    _height: number,
    manifest: ThemeManifest | null,
    themeId?: string,
  ): Promise<void> {
    this.container = container;
    this.manifest = manifest;
    this.themeId = themeId ?? manifest?.id ?? "";

    // Inject CSS
    this.styleEl = document.createElement("style");
    this.styleEl.textContent = SPRITE_CSS;
    document.head.appendChild(this.styleEl);

    // Root element (clip area)
    this.root = document.createElement("div");
    this.root.style.cssText = "position:relative;width:100%;height:100%;overflow:hidden;border-radius:12px;";
    container.appendChild(this.root);

    // Viewport (transformed inner container — sized to canvas aspect ratio)
    this.viewport = document.createElement("div");
    this.viewport.style.cssText = "position:absolute;transform-origin:0 0;";
    this.root.appendChild(this.viewport);

    const canvasW = manifest?.canvas?.width ?? 1376;
    const canvasH = manifest?.canvas?.height ?? 768;
    this.canvasAspect = canvasW / canvasH;
    this.layoutViewport();

    const scenes = manifest?.scenes;
    if (!scenes) return;

    // Pre-create background layers for each scene (for crossfade)
    const sceneKeys: SceneKey[] = ["working", "idle", "sleeping"];
    for (const key of sceneKeys) {
      const scene = scenes[key];
      if (!scene) continue;

      const layer = document.createElement("div");
      layer.className = "sprite-bg-layer";
      layer.style.opacity = key === this.currentScene ? "1" : "0";

      const img = document.createElement("img");
      img.src = `/themes/${this.themeId}/${scene.background}`;
      img.alt = `${this.themeId} ${key}`;
      img.draggable = false;
      layer.appendChild(img);

      this.viewport.appendChild(layer);
      this.bgLayers.set(key, layer);
    }

    // Overlay container
    this.overlayContainer = document.createElement("div");
    this.overlayContainer.style.cssText = "position:absolute;inset:0;pointer-events:none;";
    this.viewport.appendChild(this.overlayContainer);

    // Hitbox
    this.hitboxEl = document.createElement("div");
    this.hitboxEl.style.cssText = "position:absolute;cursor:pointer;z-index:10;";
    this.hitboxEl.addEventListener("click", this.handleHitboxClick);
    this.viewport.appendChild(this.hitboxEl);

    // Detect mobile and set up pan
    this.isMobile = container.clientWidth < MOBILE_BREAKPOINT;
    if (this.isMobile) {
      this.scale = MOBILE_SCALE;
      this.centerPan();
      this.applyTransform();
      this.bindPanEvents();
    }

    // Render initial scene
    this.renderScene(this.currentScene);
  }

  destroy(): void {
    this.unbindPanEvents();
    if (this.hitboxEl) {
      this.hitboxEl.removeEventListener("click", this.handleHitboxClick);
    }
    if (this.styleEl) {
      this.styleEl.remove();
      this.styleEl = null;
    }
    if (this.root) {
      this.root.remove();
      this.root = null;
    }
    this.viewport = null;
    this.bgLayers.clear();
    this.overlayContainer = null;
    this.hitboxEl = null;
    this.container = null;
    this.manifest = null;
  }

  resize(_width: number, _height: number): void {
    if (!this.container || !this.root) return;

    this.layoutViewport();

    const wasMobile = this.isMobile;
    this.isMobile = this.container.clientWidth < MOBILE_BREAKPOINT;

    if (this.isMobile && !wasMobile) {
      // Switched to mobile
      this.scale = MOBILE_SCALE;
      this.centerPan();
      this.applyTransform();
      this.bindPanEvents();
    } else if (!this.isMobile && wasMobile) {
      // Switched to desktop
      this.scale = 1;
      this.panX = 0;
      this.panY = 0;
      this.applyTransform();
      this.unbindPanEvents();
    } else if (this.isMobile) {
      // Still mobile — re-clamp after container size change
      this.clampPan();
      this.applyTransform();
    }
  }

  updateAgents(agents: Agent[]): void {
    const agent = agents[0];
    if (!agent) return;

    this.firstAgentId = agent.id;
    const target = statusToScene(agent.status);
    if (target !== this.currentScene) {
      this.transitionTo(target);
    }
  }

  selectAgent(_agentId: string | null): void {
    // Single-agent sprite renderer — no visual selection needed
  }

  // ── Private: Hit / Scene ──────────────────────────────────────

  private handleHitboxClick = (): void => {
    this.onCharacterClick?.();
    if (this.firstAgentId) {
      this.onAgentClick?.(this.firstAgentId);
    }
  };

  private transitionTo(scene: SceneKey): void {
    for (const [key, layer] of this.bgLayers) {
      layer.style.opacity = key === scene ? "1" : "0";
    }
    this.currentScene = scene;
    this.renderScene(scene);
  }

  private renderScene(key: SceneKey): void {
    const scenes = this.manifest?.scenes;
    if (!scenes || !this.overlayContainer) return;

    const scene: SpriteScene | undefined = scenes[key];

    this.overlayContainer.innerHTML = "";

    if (scene) {
      for (const ov of scene.overlays) {
        this.overlayContainer.appendChild(buildOverlay(ov));
      }
    }

    this.updateHitbox(key);
  }

  private updateHitbox(key: SceneKey): void {
    if (!this.hitboxEl || !this.manifest?.characterHitbox) return;

    const hitbox = this.manifest.characterHitbox[key];
    if (!hitbox) {
      this.hitboxEl.style.display = "none";
      return;
    }

    const [left, top, width, height] = hitbox.rect;
    this.hitboxEl.style.display = "block";
    this.hitboxEl.style.left = `${left}%`;
    this.hitboxEl.style.top = `${top}%`;
    this.hitboxEl.style.width = `${width}%`;
    this.hitboxEl.style.height = `${height}%`;
  }

  // ── Private: Viewport Layout ────────────────────────────────────

  /** Size the viewport div to match the canvas aspect ratio (contain-fit). */
  private layoutViewport(): void {
    if (!this.root || !this.viewport) return;
    const cw = this.root.clientWidth;
    const ch = this.root.clientHeight;
    const containerAspect = cw / ch;

    if (containerAspect > this.canvasAspect) {
      // Container wider than canvas → fit by height
      this.vpH = ch;
      this.vpW = ch * this.canvasAspect;
    } else {
      // Container taller than canvas → fit by width
      this.vpW = cw;
      this.vpH = cw / this.canvasAspect;
    }

    this.viewport.style.width = `${this.vpW}px`;
    this.viewport.style.height = `${this.vpH}px`;
    this.viewport.style.left = `${(cw - this.vpW) / 2}px`;
    this.viewport.style.top = `${(ch - this.vpH) / 2}px`;
  }

  // ── Private: Pan / Zoom ───────────────────────────────────────

  private applyTransform(): void {
    if (!this.viewport) return;
    this.viewport.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
  }

  private centerPan(): void {
    if (!this.root) return;
    const cw = this.root.clientWidth;
    const ch = this.root.clientHeight;
    // Center the scaled viewport within the root clip area
    this.panX = (cw - this.vpW * this.scale) / 2;
    this.panY = (ch - this.vpH * this.scale) / 2;
    this.clampPan();
  }

  private clampPan(): void {
    if (!this.root) return;
    const cw = this.root.clientWidth;
    const ch = this.root.clientHeight;
    const scaledW = this.vpW * this.scale;
    const scaledH = this.vpH * this.scale;
    // Don't let edges scroll past the root container
    const minX = cw - scaledW;
    const minY = ch - scaledH;
    this.panX = Math.min(0, Math.max(minX, this.panX));
    this.panY = Math.min(0, Math.max(minY, this.panY));
  }

  private bindPanEvents(): void {
    if (!this.root) return;
    this.root.addEventListener("touchstart", this.onPointerDown, { passive: false });
    this.root.addEventListener("touchmove", this.onPointerMove, { passive: false });
    this.root.addEventListener("touchend", this.onPointerUp);
    this.root.addEventListener("mousedown", this.onPointerDown);
    this.root.addEventListener("mousemove", this.onPointerMove);
    this.root.addEventListener("mouseup", this.onPointerUp);
    this.root.addEventListener("mouseleave", this.onPointerUp);
  }

  private unbindPanEvents(): void {
    if (!this.root) return;
    this.root.removeEventListener("touchstart", this.onPointerDown);
    this.root.removeEventListener("touchmove", this.onPointerMove);
    this.root.removeEventListener("touchend", this.onPointerUp);
    this.root.removeEventListener("mousedown", this.onPointerDown);
    this.root.removeEventListener("mousemove", this.onPointerMove);
    this.root.removeEventListener("mouseup", this.onPointerUp);
    this.root.removeEventListener("mouseleave", this.onPointerUp);
  }

  private clientPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
    if ("touches" in e && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    const me = e as MouseEvent;
    return { x: me.clientX, y: me.clientY };
  }

  private onPointerDown = (e: MouseEvent | TouchEvent): void => {
    if (!this.isMobile) return;
    // Don't prevent default on the hitbox click area
    const pos = this.clientPos(e);
    this.dragging = true;
    this.dragStartX = pos.x;
    this.dragStartY = pos.y;
    this.panStartX = this.panX;
    this.panStartY = this.panY;
  };

  private onPointerMove = (e: MouseEvent | TouchEvent): void => {
    if (!this.dragging) return;
    e.preventDefault();
    const pos = this.clientPos(e);
    this.panX = this.panStartX + (pos.x - this.dragStartX);
    this.panY = this.panStartY + (pos.y - this.dragStartY);
    this.clampPan();
    this.applyTransform();
  };

  private onPointerUp = (): void => {
    this.dragging = false;
  };
}
