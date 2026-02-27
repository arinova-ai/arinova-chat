import * as THREE from "three";
import type { OfficeRenderer } from "./types";
import type { Agent, AgentStatus } from "../types";
import type { ThemeManifest, ThemeQuality, QualityRendererHints, ZoneDef, ZoneType } from "../theme-types";

// ── Constants ────────────────────────────────────────────────────
const DEFAULT_CANVAS_W = 1920;
const DEFAULT_CANVAS_H = 1080;
const WORLD_SCALE = 0.5;
const BOT_HEIGHT = 40;
const LERP_FACTOR = 0.08;
const CHARACTER_MOVE_SPEED = 1.0; // units per second

const DEFAULT_STATUS_COLORS: Record<AgentStatus, number> = {
  working: 0x16a34a,
  idle: 0xf59e0b,
  blocked: 0xdc2626,
  collaborating: 0x2563eb,
};

// ── Helpers ──────────────────────────────────────────────────────

/** All known texture-map properties on THREE materials (GLB models use many of these). */
const TEXTURE_KEYS: readonly string[] = [
  "map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap",
  "aoMap", "alphaMap", "lightMap", "bumpMap", "displacementMap",
  "envMap", "specularMap", "gradientMap",
];

/** Dispose a material and ALL of its texture maps to avoid GPU memory leaks. */
function disposeMaterial(material: THREE.Material): void {
  const m = material as unknown as Record<string, unknown>;
  for (const key of TEXTURE_KEYS) {
    const tex = m[key];
    if (tex instanceof THREE.Texture) tex.dispose();
  }
  material.dispose();
}

function canvasToWorld(cx: number, cy: number, cw: number, ch: number): THREE.Vector3 {
  return new THREE.Vector3(
    (cx - cw / 2) * WORLD_SCALE,
    0,
    (cy - ch / 2) * WORLD_SCALE,
  );
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

/** Normalize a loaded GLTF scene to fit within the given height, centered on ground. */
function normalizeModel(group: THREE.Group, targetHeight: number): void {
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) {
    const s = targetHeight / maxDim;
    group.scale.set(s, s, s);
  }
  // Re-compute after scale and center horizontally, sit on ground
  box.setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.x -= center.x;
  group.position.z -= center.z;
  group.position.y -= box.min.y;
}

/** Create a text label sprite using canvas texture. */
function createLabelSprite(
  text: string,
  color: string = "#e2e8f0",
  bgColor: string = "rgba(15, 23, 42, 0.85)",
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = 256;
  canvas.height = 64;

  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Background pill
  const metrics = ctx.measureText(text);
  const pw = Math.min(metrics.width + 20, canvas.width - 4);
  const ph = 34;
  const px = (canvas.width - pw) / 2;
  const py = (canvas.height - ph) / 2;
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 8);
  ctx.fill();

  // Text
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(40, 10, 1);
  return sprite;
}

/** Darken a hex color by a fraction (0–1). Returns a new hex number. */
function darkenColor(hex: number, amount: number): number {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, -amount);
  return c.getHex();
}

/** Check if theme uses v3 features (room model). */
function isV3Theme(manifest: ThemeManifest | null): boolean {
  return !!manifest?.room?.model;
}

/** Read theme quality setting from localStorage. */
function readThemeQuality(): ThemeQuality {
  try {
    const saved = localStorage.getItem("arinova_theme_quality");
    return saved === "performance" ? "performance" : "high";
  } catch {
    return "high";
  }
}

/** Resolve quality renderer hints — theme manifest overrides > built-in defaults. */
function resolveRendererHints(
  quality: ThemeQuality,
  manifest: ThemeManifest | null,
): Required<QualityRendererHints> {
  const hints = manifest?.quality?.[quality]?.renderer;
  const isHigh = quality === "high";
  return {
    pixelRatio: hints?.pixelRatio ?? (isHigh ? Math.min(window.devicePixelRatio, 2) : 1),
    antialias: hints?.antialias ?? isHigh,
    lighting: hints?.lighting ?? (isHigh ? "full" : "ambient-only"),
    anisotropy: hints?.anisotropy ?? isHigh,
  };
}

// ── ThreeJSRenderer ──────────────────────────────────────────────

export class ThreeJSRenderer implements OfficeRenderer {
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private container: HTMLDivElement | null = null;
  private animId = 0;
  private width = 0;
  private height = 0;
  private manifest: ThemeManifest | null = null;

  // Canvas dimensions from manifest (fallback to 1920×1080)
  private canvasW = DEFAULT_CANVAS_W;
  private canvasH = DEFAULT_CANVAS_H;

  private agents: Agent[] = [];
  private selectedAgentId: string | null = null;

  // Agent 3D representation: Group containing model + label + status dot
  private agentGroups = new Map<string, THREE.Group>();
  // Loaded bot model template (cloned per agent)
  private botTemplate: THREE.Group | null = null;

  // Raycaster for click detection
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  // Status colors parsed from manifest
  private statusColors: Record<AgentStatus, number> = { ...DEFAULT_STATUS_COLORS };

  // Background color from manifest (used for ground, zone floors, etc.)
  private bgColor = 0x1a1a2e;

  // Name tag style from manifest
  private nameTagColor = "#e2e8f0";
  private nameTagBgColor = "rgba(15, 23, 42, 0.85)";

  // Lerp animation targets
  private targetPositions = new Map<string, THREE.Vector3>();

  // ── v3: AnimationMixer + character ───────────────────────────
  private mixer: THREE.AnimationMixer | null = null;
  private clock = new THREE.Clock();
  private characterModel: THREE.Object3D | null = null;
  private animationClips: Record<string, THREE.AnimationClip> = {};
  private currentAction: THREE.AnimationAction | null = null;
  private currentFinishedHandler: ((e: { action: THREE.AnimationAction }) => void) | null = null;

  // ── v3: Room scene ──────────────────────────────────────────
  private roomScene: THREE.Object3D | null = null;
  private backgroundTexture: THREE.Texture | null = null;

  // ── v3: Animation State Machine ────────────────────────────
  private characterState: "working" | "idle" | "sleeping" = "idle";
  private walkRequest: { target: THREE.Vector3; onArrival: () => void } | null = null;
  private idleTimer = 0;
  private idleCycleTimer: ReturnType<typeof setTimeout> | null = null;
  private characterPositions: Record<string, THREE.Vector3> = {};
  private static IDLE_TIMEOUT = 30 * 60; // 30 minutes in seconds
  private static IDLE_ANIMS = ["dance", "swing", "crunch", "pushup"];

  // ── DRACOLoader for compressed GLB models ──────────────────
  private dracoLoader: import("three/examples/jsm/loaders/DRACOLoader.js").DRACOLoader | null = null;

  // ── OrbitControls for pan/zoom ────────────────────────────
  private controls: import("three/examples/jsm/controls/OrbitControls.js").OrbitControls | null = null;
  /** Frustum computed by fitCameraToRoom(); used in resize(). */
  private v3Frustum: number | null = null;

  /** Quality mode read at init — affects pixel ratio, lighting, resource paths */
  private quality: ThemeQuality = "high";
  /** Resolved renderer hints (from manifest or defaults). */
  private hints!: Required<QualityRendererHints>;

  onAgentClick?: (agentId: string) => void;
  onCharacterClick?: () => void;

  // ── init ──────────────────────────────────────────────────────

  async init(
    container: HTMLDivElement,
    width: number,
    height: number,
    manifest: ThemeManifest | null,
    _themeId?: string,
  ): Promise<void> {
    this.container = container;
    this.width = width;
    this.height = height;
    this.manifest = manifest;
    this.quality = readThemeQuality();
    this.hints = resolveRendererHints(this.quality, manifest);
    this.canvasW = manifest?.canvas?.width ?? DEFAULT_CANVAS_W;
    this.canvasH = manifest?.canvas?.height ?? DEFAULT_CANVAS_H;
    this.statusColors = parseStatusColors(manifest);

    // Parse background color
    const bgColorStr = manifest?.canvas?.background?.color;
    this.bgColor = bgColorStr ? Number(bgColorStr) : 0x1a1a2e;

    // Parse name tag style from manifest
    const nt = manifest?.characters?.nameTag;
    if (nt?.color) this.nameTagColor = nt.color;
    if (nt?.bgColor) this.nameTagBgColor = nt.bgColor;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.bgColor);

    // Background image (v3 themes)
    const bgImageDefault = manifest?.canvas?.background?.image;
    if (bgImageDefault && isV3Theme(manifest)) {
      const bgImage = this.resolveQualityPath("background", "image", bgImageDefault);
      const bgUrl = `/themes/${manifest.id}/${bgImage}`;
      new THREE.TextureLoader().load(bgUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        this.backgroundTexture = tex;
        if (this.scene) this.scene.background = tex;
      });
    }

    // Camera — v3 uses manifest camera config, legacy uses hardcoded
    if (isV3Theme(manifest)) {
      this.setupCameraV3(width, height);
    } else {
      this.setupCamera(width, height);
    }

    // WebGL renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.hints.antialias,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.hints.pixelRatio);
    // v3 themes disable realtime shadows (small room, ambient+directional suffice);
    // legacy themes keep PCFSoftShadowMap for zone-based office.
    this.renderer.shadowMap.enabled = !isV3Theme(manifest);
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // v3 themes: NoToneMapping preserves GLB material colors as-authored by
    // the artist — ACESFilmic amplifies subtle texture variations on flat
    // pastel surfaces (walls) causing visible speckles/noise.
    // Legacy themes keep ACESFilmic for cinematic look.
    if (isV3Theme(manifest)) {
      this.renderer.toneMapping = THREE.NoToneMapping;
    } else {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.2;
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // v3: OrbitControls for pan/zoom (desktop scroll + drag, mobile pinch + swipe)
    if (isV3Theme(manifest)) {
      await this.setupOrbitControls();
    }

    // Lighting — v3 uses manifest lighting config
    if (isV3Theme(manifest)) {
      this.setupLightsV3();
    } else {
      this.setupLights();
    }

    if (isV3Theme(manifest)) {
      // v3 path: load room model + animated character
      await this.loadRoomModel();
      await this.loadCharacterModel();
    } else {
      // Legacy path: ground + zones + individual furniture + bot model
      this.createGround();
      this.drawZoneFloors();
      await this.loadModels();
      this.placeFurniture();
    }

    // Click handler
    this.renderer.domElement.addEventListener("click", this.handleClick);

    // v3: Number keys trigger animations
    if (isV3Theme(manifest)) {
      window.addEventListener("keydown", this.handleKeyDown);
    }

    this.startRenderLoop();
  }

  // ── destroy ───────────────────────────────────────────────────

  destroy(): void {
    cancelAnimationFrame(this.animId);

    this.renderer?.domElement.removeEventListener("click", this.handleClick);
    window.removeEventListener("keydown", this.handleKeyDown);

    // Dispose OrbitControls
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }

    // Stop animation mixer
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }

    // Dispose background texture (loaded separately from scene graph)
    if (this.backgroundTexture) {
      this.backgroundTexture.dispose();
      this.backgroundTexture = null;
    }
    if (this.scene) {
      this.scene.background = null;
    }

    // Traverse entire scene and dispose all GPU resources
    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => disposeMaterial(m));
          } else {
            disposeMaterial(obj.material as THREE.Material);
          }
        }
        if (obj instanceof THREE.Sprite) {
          disposeMaterial(obj.material);
        }
      });
    }

    this.agentGroups.clear();
    this.targetPositions.clear();
    this.botTemplate = null;
    this.characterModel = null;
    this.roomScene = null;
    this.animationClips = {};
    this.currentAction = null;
    this.currentFinishedHandler = null;
    this.v3Frustum = null;

    // State machine cleanup
    this.walkRequest = null;
    this.characterState = "idle";
    this.idleTimer = 0;
    this.characterPositions = {};
    if (this.idleCycleTimer) {
      clearTimeout(this.idleCycleTimer);
      this.idleCycleTimer = null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__setAgentStatus;

    if (this.dracoLoader) {
      this.dracoLoader.dispose();
      this.dracoLoader = null;
    }

    this.renderer?.dispose();
    if (this.renderer?.domElement && this.container) {
      this.container.removeChild(this.renderer.domElement);
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.container = null;
  }

  // ── resize ────────────────────────────────────────────────────

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.renderer) {
      this.renderer.setSize(width, height);
    }
    if (this.camera) {
      if (isV3Theme(this.manifest)) {
        const frustum = this.v3Frustum ?? this.manifest?.camera?.frustum ?? 8;
        const aspect = width / height;
        this.camera.left = -frustum * aspect;
        this.camera.right = frustum * aspect;
        this.camera.top = frustum;
        this.camera.bottom = -frustum;
      } else {
        const frustum = 250;
        const aspect = width / height;
        this.camera.left = -frustum * aspect;
        this.camera.right = frustum * aspect;
        this.camera.top = frustum;
        this.camera.bottom = -frustum;
      }
      this.camera.updateProjectionMatrix();
    }
    if (this.controls) {
      this.controls.update();
    }
  }

  // ── updateAgents ──────────────────────────────────────────────

  updateAgents(agents: Agent[]): void {
    if (!this.scene) return;
    this.agents = agents;

    // v3 themes don't use agent zone placement (character is user-controlled)
    if (isV3Theme(this.manifest)) return;

    const currentIds = new Set(agents.map((a) => a.id));

    // Remove stale agents
    for (const [id, group] of this.agentGroups) {
      if (!currentIds.has(id)) {
        this.scene.remove(group);
        this.disposeGroup(group);
        this.agentGroups.delete(id);
        this.targetPositions.delete(id);
      }
    }

    // Compute seat assignments
    const zones = this.manifest?.zones ?? [];
    let assignments: Map<string, { x: number; y: number; seatId: string }>;

    if (zones.length > 0) {
      assignments = assignSeats(agents, zones);
    } else {
      // Fallback: line up horizontally
      assignments = new Map();
      const spacing = 80;
      const startX = this.canvasW / 2 - ((agents.length - 1) * spacing) / 2;
      agents.forEach((a, i) => {
        assignments.set(a.id, {
          x: startX + i * spacing,
          y: this.canvasH / 2,
          seatId: `fallback-${i}`,
        });
      });
    }

    // Create or update agent groups
    for (const agent of agents) {
      const seat = assignments.get(agent.id);
      if (!seat) continue;
      const worldPos = canvasToWorld(seat.x, seat.y, this.canvasW, this.canvasH);
      this.targetPositions.set(agent.id, worldPos);

      let group = this.agentGroups.get(agent.id);
      if (!group) {
        group = this.createAgentGroup(agent);
        group.position.copy(worldPos);
        this.scene!.add(group);
        this.agentGroups.set(agent.id, group);
      }

      // Update status color + selection
      this.updateAgentColor(group, agent.status);
      group.scale.setScalar(agent.id === this.selectedAgentId ? 1.2 : 1.0);
    }
  }

  // ── selectAgent ───────────────────────────────────────────────

  selectAgent(agentId: string | null): void {
    this.selectedAgentId = agentId;

    for (const [id, group] of this.agentGroups) {
      group.scale.setScalar(id === agentId ? 1.2 : 1.0);
    }
  }

  // ── Private: Camera (legacy) ──────────────────────────────────

  private setupCamera(w: number, h: number): void {
    const frustum = 250;
    const aspect = w / h;
    this.camera = new THREE.OrthographicCamera(
      -frustum * aspect, frustum * aspect,
      frustum, -frustum,
      0.1, 2000,
    );
    // Elevated isometric-style view
    this.camera.position.set(0, 600, 350);
    this.camera.lookAt(0, 0, 0);
  }

  // ── Private: Camera (v3) ──────────────────────────────────────

  private setupCameraV3(w: number, h: number): void {
    const camConfig = this.manifest?.camera;
    const frustum = camConfig?.frustum ?? 8;
    const aspect = w / h;

    this.camera = new THREE.OrthographicCamera(
      -frustum * aspect, frustum * aspect,
      frustum, -frustum,
      0.1, 200,
    );

    const pos = camConfig?.position ?? [7, 7, 6];
    this.camera.position.set(pos[0], pos[1], pos[2]);

    const target = camConfig?.target ?? [0, 0, 0];
    this.camera.lookAt(target[0], target[1], target[2]);
  }

  // ── Private: Lighting (legacy) ────────────────────────────────

  private setupLights(): void {
    if (!this.scene) return;

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambient);

    // Hemisphere for subtle sky/ground color variation
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x362d22, 0.3);
    this.scene.add(hemi);

    // Main directional with shadow
    const dir = new THREE.DirectionalLight(0xfff5e6, 0.8);
    dir.position.set(200, 500, 200);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.bias = -0.002;
    dir.shadow.normalBias = 0.02;
    dir.shadow.camera.left = -500;
    dir.shadow.camera.right = 500;
    dir.shadow.camera.top = 500;
    dir.shadow.camera.bottom = -500;
    this.scene.add(dir);

    // Soft fill from opposite side
    const fill = new THREE.DirectionalLight(0xc4d4ff, 0.3);
    fill.position.set(-200, 300, -100);
    this.scene.add(fill);

    // Warm window light (simulate sunlight streaming in)
    const windowLight = new THREE.SpotLight(0xfff0d4, 0.6, 600, Math.PI / 4);
    windowLight.position.set(-200, 400, -200);
    windowLight.castShadow = false;
    this.scene.add(windowLight);
  }

  // ── Private: Lighting (v3) ────────────────────────────────────

  private setupLightsV3(): void {
    if (!this.scene) return;

    const lightConfig = this.manifest?.lighting;

    // Ambient — provides uniform base illumination (no specular, no shadows).
    // High intensity so the GLB materials look correct without complex lighting.
    const ambientColor = lightConfig?.ambient?.color
      ? Number(lightConfig.ambient.color) : 0xffffff;
    const ambientIntensity = lightConfig?.ambient?.intensity ?? 1.0;
    this.scene.add(new THREE.AmbientLight(ambientColor, ambientIntensity));

    // Ambient-only: skip directional light
    if (this.hints.lighting === "ambient-only") return;

    // Single soft directional from directly above — gentle fill that avoids
    // specular hotspots on vertical walls (straight-down light minimises
    // specular reflection on surfaces facing the camera at oblique angles).
    const dirColor = lightConfig?.directional?.color
      ? Number(lightConfig.directional.color) : 0xffffff;
    const dirIntensity = lightConfig?.directional?.intensity ?? 0.3;
    const dirPos = lightConfig?.directional?.position ?? [0, 10, 0];

    const dir = new THREE.DirectionalLight(dirColor, dirIntensity);
    dir.position.set(dirPos[0], dirPos[1], dirPos[2]);
    dir.castShadow = false;
    this.scene.add(dir);
  }

  // ── Private: OrbitControls (v3) ─────────────────────────────

  private async setupOrbitControls(): Promise<void> {
    if (!this.camera || !this.renderer) return;

    const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableRotate = false; // Keep isometric angle fixed
    this.controls.enablePan = true;
    this.controls.enableZoom = true;
    this.controls.screenSpacePanning = true;

    // Zoom limits from viewport config
    const viewport = this.manifest?.viewport;
    this.controls.minZoom = viewport?.minZoom ?? 0.5;
    this.controls.maxZoom = viewport?.maxZoom ?? 3.0;

    // Desktop: left-drag = pan, scroll = zoom
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };

    // Mobile: one-finger drag = pan, two-finger pinch = zoom+pan
    this.controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    // Set target from camera config
    const target = this.manifest?.camera?.target ?? [0, 0, 0];
    this.controls.target.set(target[0], target[1], target[2]);
    this.controls.update();
  }

  // ── Private: Auto-fit camera to room bounding box (v3) ─────

  private fitCameraToRoom(): void {
    if (!this.camera || !this.roomScene) return;

    const box = new THREE.Box3().setFromObject(this.roomScene);
    const center = box.getCenter(new THREE.Vector3());

    // Maintain camera direction but re-center on room
    const camConfig = this.manifest?.camera;
    const origTarget = camConfig?.target ?? [0, 0, 0];
    const origPos = camConfig?.position ?? [-8, 12, -8];
    const offset = new THREE.Vector3(
      origPos[0] - origTarget[0],
      origPos[1] - origTarget[1],
      origPos[2] - origTarget[2],
    );

    this.camera.position.copy(center).add(offset);
    this.camera.lookAt(center);

    if (this.controls) {
      this.controls.target.copy(center);
    }

    // Transform bounding-box corners to camera space to find required frustum
    this.camera.updateMatrixWorld();
    const viewMatrix = this.camera.matrixWorldInverse;

    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const corner of corners) {
      const projected = corner.applyMatrix4(viewMatrix);
      minX = Math.min(minX, projected.x);
      maxX = Math.max(maxX, projected.x);
      minY = Math.min(minY, projected.y);
      maxY = Math.max(maxY, projected.y);
    }

    const aspect = this.width / this.height;
    const roomWidth = maxX - minX;
    const roomHeight = maxY - minY;
    const padding = 1.1; // 10% margin

    // Frustum half-height that fits both dimensions
    const frustumH = (roomHeight * padding) / 2;
    const frustumW = (roomWidth * padding) / 2;
    const frustum = Math.max(frustumH, frustumW / aspect);

    this.v3Frustum = frustum;
    this.camera.left = -frustum * aspect;
    this.camera.right = frustum * aspect;
    this.camera.top = frustum;
    this.camera.bottom = -frustum;
    // Apply zoom from theme.json (bigger number = more zoomed in)
    this.camera.zoom = camConfig?.zoom ?? 1;
    this.camera.updateProjectionMatrix();

    if (this.controls) {
      this.controls.update();
    }
  }

  // ── Private: Create GLTFLoader with DRACOLoader ──────────────

  private async createGLTFLoader() {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");

    // Lazy singleton: reuse existing DRACOLoader
    if (!this.dracoLoader) {
      const { DRACOLoader } = await import("three/examples/jsm/loaders/DRACOLoader.js");
      this.dracoLoader = new DRACOLoader();
      this.dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
    }

    const loader = new GLTFLoader();
    loader.setDRACOLoader(this.dracoLoader);
    return loader;
  }

  // ── Private: Load room model (v3) ─────────────────────────────

  /** Resolve a resource path using quality overrides if available. */
  private resolveQualityPath(
    category: "room" | "character" | "background",
    field: "model" | "image",
    fallback: string,
  ): string {
    const override = this.manifest?.quality?.[this.quality]?.[category];
    if (override && field in override) return (override as Record<string, string>)[field];
    return fallback;
  }

  private async loadRoomModel(): Promise<void> {
    if (!this.scene || !this.manifest?.room?.model) return;

    const loader = await this.createGLTFLoader();

    const roomModel = this.resolveQualityPath("room", "model", this.manifest.room.model);
    const roomUrl = `/themes/${this.manifest.id}/${roomModel}`;
    try {
      const gltf = await loader.loadAsync(roomUrl);
      this.roomScene = gltf.scene;
      const scale = this.manifest.room.scale ?? [1, 1, 1];
      this.roomScene.scale.set(scale[0], scale[1], scale[2]);

      // Shadows disabled for v3 (renderer.shadowMap.enabled = false).
      // Set max anisotropy on all textures for better quality at oblique angles.
      // NOTE: wall speckles are baked into the model's texture atlas (per-face UV
      // baking with insufficient island margins). Fix requires re-exporting the
      // model with proper UV padding — not a renderer-side issue.
      this.roomScene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = false;
          child.receiveShadow = false;

          // Anisotropy: sharp textures at oblique angles
          if (this.hints.anisotropy) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            for (const mat of materials) {
              if (mat && 'isMeshStandardMaterial' in mat && (mat as any).isMeshStandardMaterial) {
                const stdMat = mat as THREE.MeshStandardMaterial;
                const maxAniso = this.renderer!.capabilities.getMaxAnisotropy();
                const textures = [stdMat.map, stdMat.normalMap, stdMat.roughnessMap, stdMat.metalnessMap];
                for (const tex of textures) {
                  if (tex) tex.anisotropy = maxAniso;
                }
              }
            }
          }
        }
      });

      this.scene.add(this.roomScene);

      // Auto-fit camera frustum so room fills the viewport
      this.fitCameraToRoom();
    } catch (err) {
      console.warn("[ThreeJSRenderer] Failed to load room model:", err);
    }
  }

  // ── Private: Load character model (v3) ────────────────────────

  private async loadCharacterModel(): Promise<void> {
    if (!this.scene || !this.manifest?.character?.model) return;

    const loader = await this.createGLTFLoader();

    // Load main character model (with walk animation)
    const charModel = this.resolveQualityPath("character", "model", this.manifest.character.model);
    const charUrl = `/themes/${this.manifest.id}/${charModel}`;
    try {
      const gltf = await loader.loadAsync(charUrl);
      this.characterModel = gltf.scene;

      const scale = this.manifest.character.scale ?? [1, 1, 1];
      this.characterModel.scale.set(scale[0], scale[1], scale[2]);

      // Character casts shadows onto room but doesn't receive (avoids self-shadow acne)
      this.characterModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = false;
        }
      });

      // Raise character so feet sit on the floor (not sunk into ground).
      // Compute from model bounding box: shift up by -box.min.y so bottom = 0.
      const charBox = new THREE.Box3().setFromObject(this.characterModel);
      this.characterModel.position.y = -charBox.min.y;

      this.scene.add(this.characterModel);

      // Setup AnimationMixer
      this.mixer = new THREE.AnimationMixer(this.characterModel);

      // Build reverse map from clip names to canonical keys (e.g. "Armature|walking" → "walk")
      const animMap = this.manifest.character?.animations ?? {};
      const reverseMap: Record<string, string> = {};
      for (const [key, clipName] of Object.entries(animMap)) {
        reverseMap[clipName as string] = key;
      }

      // Store animations using canonical keys from manifest mapping
      for (const clip of gltf.animations) {
        const canonicalKey = reverseMap[clip.name] ?? clip.name;
        this.animationClips[canonicalKey] = clip;
      }

      // If there's only one animation clip, map it to "walk"
      if (gltf.animations.length === 1 && !this.animationClips["walk"]) {
        this.animationClips["walk"] = gltf.animations[0];
      }
    } catch (err) {
      console.warn("[ThreeJSRenderer] Failed to load character model:", err);
      return;
    }

    // Load separate idle model if specified
    if (this.manifest.character.idleModel) {
      const idleUrl = `/themes/${this.manifest.id}/${this.manifest.character.idleModel}`;
      try {
        const idleGltf = await loader.loadAsync(idleUrl);
        const animMap = this.manifest.character?.animations ?? {};
        const reverseMap: Record<string, string> = {};
        for (const [key, clipName] of Object.entries(animMap)) {
          reverseMap[clipName as string] = key;
        }
        for (const clip of idleGltf.animations) {
          const canonicalKey = reverseMap[clip.name] ?? clip.name;
          this.animationClips[canonicalKey] = clip;
        }
        // If only one clip and no idle yet, use it
        if (idleGltf.animations.length === 1 && !this.animationClips["idle"]) {
          this.animationClips["idle"] = idleGltf.animations[0];
        }
      } catch (err) {
        console.warn("[ThreeJSRenderer] Failed to load idle model:", err);
      }
    }

    // Add invisible hit-box cylinder for click detection
    if (this.characterModel) {
      const charHeight = this.manifest.character?.height ?? 1.6;
      const hitGeo = new THREE.CylinderGeometry(0.4, 0.4, charHeight, 8);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.name = "character-hit-box";
      hitMesh.position.y = charHeight / 2;
      this.characterModel.add(hitMesh);
    }

    // Parse named positions from theme.json
    const positions = this.manifest.character?.positions;
    if (positions) {
      for (const [key, coords] of Object.entries(positions)) {
        this.characterPositions[key] = new THREE.Vector3(coords[0], coords[1], coords[2]);
      }
    }

    // Start state machine with default "idle" state
    this.transitionTo("idle");

    // Debug: expose status setter on window for console testing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__setAgentStatus = (status: string) => {
      if (status === "working" || status === "idle" || status === "sleeping") {
        this.transitionTo(status);
      } else {
        console.warn(`[StateMachine] Unknown status: ${status}. Use working/idle/sleeping.`);
      }
    };
  }

  // ── Private: Play animation ───────────────────────────────────

  // Animations that play once (not looping) — state machine controls transitions
  private static ONE_SHOT_ANIMS = new Set([
    "fall", "stand_up", "walk_to_sit", "lie_down", "pushup_to_idle", "sit_to_stand",
  ]);

  private playAnimation(name: string, onFinished?: () => void): void {
    if (!this.mixer) return;
    const clip = this.animationClips[name];
    if (!clip) {
      // If clip not found, call onFinished so state machine doesn't stall
      onFinished?.();
      return;
    }

    // Remove any stale finished handler from a previous one-shot animation
    if (this.currentFinishedHandler) {
      this.mixer.removeEventListener("finished", this.currentFinishedHandler as any);
      this.currentFinishedHandler = null;
    }

    if (this.currentAction) {
      this.currentAction.fadeOut(0.3);
    }

    const action = this.mixer.clipAction(clip);
    if (ThreeJSRenderer.ONE_SHOT_ANIMS.has(name)) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      if (onFinished) {
        const handler = (e: { action: THREE.AnimationAction }) => {
          // Only fire if this is the action we're waiting on
          if (e.action !== action) return;
          this.mixer?.removeEventListener("finished", handler as any);
          this.currentFinishedHandler = null;
          onFinished();
        };
        this.currentFinishedHandler = handler;
        this.mixer.addEventListener("finished", handler as any);
      }
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }
    action.reset().fadeIn(0.3).play();
    this.currentAction = action;
  }

  // ── State Machine ───────────────────────────────────────────

  private transitionTo(newState: "working" | "idle" | "sleeping"): void {
    const prevState = this.characterState;
    this.characterState = newState;
    this.idleTimer = 0;
    this.walkRequest = null;

    // Remove stale finished handler so old one-shots don't fire mid-transition
    if (this.currentFinishedHandler && this.mixer) {
      this.mixer.removeEventListener("finished", this.currentFinishedHandler as any);
      this.currentFinishedHandler = null;
    }

    // Clear idle cycle timer
    if (this.idleCycleTimer) {
      clearTimeout(this.idleCycleTimer);
      this.idleCycleTimer = null;
    }

    switch (newState) {
      case "working":
        this.goToWorking(prevState);
        break;
      case "idle":
        this.goToIdle(prevState);
        break;
      case "sleeping":
        this.goToSleeping();
        break;
    }
  }

  private goToWorking(prevState: string): void {
    const deskPos = this.characterPositions["desk"];
    if (!deskPos) { this.playAnimation("idle"); return; }

    if (prevState === "sleeping") {
      this.playAnimation("stand_up", () => {
        this.walkTo(deskPos, () => this.playAnimation("idle"));
      });
    } else {
      this.walkTo(deskPos, () => this.playAnimation("idle"));
    }
  }

  private goToIdle(prevState: string): void {
    const playgroundPos = this.characterPositions["playground"];
    if (!playgroundPos) { this.playAnimation("idle"); return; }

    if (prevState === "sleeping") {
      this.playAnimation("stand_up", () => {
        this.walkTo(playgroundPos, () => this.startIdleAnimCycle());
      });
    } else {
      this.walkTo(playgroundPos, () => this.startIdleAnimCycle());
    }
  }

  private goToSleeping(): void {
    const bedPos = this.characterPositions["bed"];
    if (!bedPos) { this.playAnimation("sleeping"); return; }

    this.walkTo(bedPos, () => {
      this.playAnimation("walk_to_sit", () => {
        this.playAnimation("lie_down", () => {
          this.playAnimation("sleeping");
        });
      });
    });
  }

  private walkTo(target: THREE.Vector3, onArrival: () => void): void {
    if (!this.characterModel) { onArrival(); return; }

    // Face the target direction
    const lookTarget = new THREE.Vector3(target.x, this.characterModel.position.y, target.z);
    this.characterModel.lookAt(lookTarget);

    this.walkRequest = { target: target.clone(), onArrival };
    this.playAnimation("walk");
  }

  private startIdleAnimCycle(): void {
    if (this.characterState !== "idle") return;

    const anims = ThreeJSRenderer.IDLE_ANIMS;
    const animName = anims[Math.floor(Math.random() * anims.length)];
    this.playIdleAnim(animName);
  }

  private playIdleAnim(name: string): void {
    if (this.characterState !== "idle") return;

    this.playAnimation(name);

    // Play looping anim for 10-15s, then switch to next random
    const duration = 10_000 + Math.random() * 5_000;

    if (this.idleCycleTimer) clearTimeout(this.idleCycleTimer);
    this.idleCycleTimer = setTimeout(() => {
      if (this.characterState !== "idle") return;

      if (name === "pushup") {
        // Pushup needs transition animation before next
        this.playAnimation("pushup_to_idle", () => this.startIdleAnimCycle());
      } else {
        this.startIdleAnimCycle();
      }
    }, duration);
  }

  // Number key → animation mapping
  // 0=idle, 1=walk, 2=sleep, 3=dance, 4=run, 5=swing, 6=crunch,
  // 7=fall, 8=pushup, 9=sit, +more via other keys
  private static KEY_ANIM_MAP: Record<string, string> = {
    "0": "idle",
    "1": "walk",
    "2": "sleep",
    "3": "dance",
    "4": "run",
    "5": "swing",
    "6": "crunch",
    "7": "fall",
    "8": "pushup",
    "9": "sit",
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    // Ignore if typing in an input
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    const animName = ThreeJSRenderer.KEY_ANIM_MAP[e.key];
    if (animName && this.animationClips[animName]) {
      this.playAnimation(animName);
    }
  };

  // ── Private: Ground (legacy) ──────────────────────────────────

  private createGround(): void {
    if (!this.scene) return;

    const w = this.canvasW * WORLD_SCALE;
    const h = this.canvasH * WORLD_SCALE;
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshStandardMaterial({
      color: this.bgColor,
      roughness: 0.9,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  // ── Private: Zone floor markers (legacy) ──────────────────────

  private drawZoneFloors(): void {
    if (!this.scene || !this.manifest?.zones) return;

    for (const zone of this.manifest.zones) {
      const b = zone.bounds;
      const center = canvasToWorld(b.x + b.width / 2, b.y + b.height / 2, this.canvasW, this.canvasH);
      const w = b.width * WORLD_SCALE;
      const h = b.height * WORLD_SCALE;

      // Semi-transparent floor rectangle (slightly darker than background)
      const zoneColor = darkenColor(this.bgColor, 0.08);
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshStandardMaterial({
        color: zoneColor,
        roughness: 0.85,
        transparent: true,
        opacity: 0.5,
      });
      const plane = new THREE.Mesh(geo, mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(center.x, 0.1, center.z);
      plane.receiveShadow = true;
      this.scene.add(plane);

      // Zone label sprite above the zone (use nameTag style from manifest)
      const label = createLabelSprite(zone.name, this.nameTagColor, this.nameTagBgColor);
      label.position.set(center.x, 55, center.z - h / 2 + 10);
      label.scale.set(50, 12, 1);
      this.scene.add(label);
    }
  }

  // ── Private: Load GLB models (legacy) ─────────────────────────

  private async loadModels(): Promise<void> {
    const loader = await this.createGLTFLoader();

    // Load agent bot model
    try {
      const gltf = await loader.loadAsync("/office/models/arinova-bot.glb");
      this.botTemplate = gltf.scene;
      normalizeModel(this.botTemplate, BOT_HEIGHT);
      this.botTemplate.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    } catch (err) {
      console.warn("[ThreeJSRenderer] Failed to load arinova-bot.glb:", err);
    }

    // Load furniture GLBs referenced in manifest
    if (!this.manifest?.furniture) return;

    const furnitureUrls = new Set<string>();
    for (const f of this.manifest.furniture) {
      if (f.sprite?.endsWith(".glb")) furnitureUrls.add(f.sprite);
    }

    const loadPromises = [...furnitureUrls].map(async (sprite) => {
      const url = sprite.startsWith("/") ? sprite : `/${sprite}`;
      try {
        const gltf = await loader.loadAsync(url);
        return { sprite, scene: gltf.scene };
      } catch (err) {
        console.warn(`[ThreeJSRenderer] Failed to load furniture "${sprite}":`, err);
        return null;
      }
    });

    const results = await Promise.all(loadPromises);
    this.furnitureScenes = new Map();
    for (const r of results) {
      if (r) this.furnitureScenes.set(r.sprite, r.scene);
    }
  }

  private furnitureScenes = new Map<string, THREE.Group>();

  // ── Private: Place furniture (legacy) ─────────────────────────

  private placeFurniture(): void {
    if (!this.scene || !this.manifest?.furniture) return;

    for (const f of this.manifest.furniture) {
      if (!f.sprite?.endsWith(".glb")) continue;
      const template = this.furnitureScenes.get(f.sprite);
      if (!template) continue;

      const clone = template.clone();

      if (f.id === "room-shell") {
        // Room shell spans the full world — scale to match world-space dimensions
        const worldW = this.canvasW * WORLD_SCALE;
        const worldH = this.canvasH * WORLD_SCALE;
        const box = new THREE.Box3().setFromObject(clone);
        const size = box.getSize(new THREE.Vector3());
        if (size.x > 0 && size.z > 0) {
          clone.scale.set(worldW / size.x, worldW / size.x, worldH / size.z);
        }
        // Re-center after scaling
        box.setFromObject(clone);
        const center = box.getCenter(new THREE.Vector3());
        clone.position.x -= center.x;
        clone.position.z -= center.z;
        clone.position.y -= box.min.y;
      } else {
        // Normal furniture: scale to target footprint in canvas space
        const targetSize = Math.max(f.width, f.height) * WORLD_SCALE * 0.5;
        normalizeModel(clone, targetSize);
        const pos = canvasToWorld(f.x, f.y, this.canvasW, this.canvasH);
        clone.position.copy(pos);
      }

      clone.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.scene.add(clone);
    }
  }

  // ── Private: Create agent group (legacy) ──────────────────────

  private createAgentGroup(agent: Agent): THREE.Group {
    const group = new THREE.Group();
    group.userData.agentId = agent.id;

    if (this.botTemplate) {
      const model = this.botTemplate.clone();
      // Clone materials so each agent can be tinted independently
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = (child.material as THREE.Material).clone();
        }
      });
      group.add(model);
    } else {
      // Fallback: colored sphere when bot model fails to load
      const geo = new THREE.SphereGeometry(15, 16, 16);
      const mat = new THREE.MeshStandardMaterial({
        color: this.statusColors[agent.status],
        roughness: 0.4,
        metalness: 0.2,
      });
      const sphere = new THREE.Mesh(geo, mat);
      sphere.name = "fallback-sphere";
      sphere.position.y = 15;
      sphere.castShadow = true;
      group.add(sphere);
    }

    // Invisible hit-box for click detection — avoids SkinnedMesh raycast
    // issues that occur when the cloned bot model shares the template's
    // skeleton reference (bone transforms don't match cloned position).
    const hitGeo = new THREE.CylinderGeometry(15, 15, BOT_HEIGHT, 8);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.name = "hit-box";
    hitMesh.position.y = BOT_HEIGHT / 2;
    group.add(hitMesh);

    // Name label sprite (use nameTag style from manifest)
    const label = createLabelSprite(agent.name, this.nameTagColor, this.nameTagBgColor);
    label.position.y = BOT_HEIGHT + 12;
    group.add(label);

    // Status dot
    const dotGeo = new THREE.SphereGeometry(3, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: this.statusColors[agent.status] });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.name = "status-dot";
    dot.position.set(12, BOT_HEIGHT + 5, 0);
    group.add(dot);

    return group;
  }

  // ── Private: Update agent color (legacy) ──────────────────────

  private updateAgentColor(group: THREE.Group, status: AgentStatus): void {
    const color = this.statusColors[status];

    // Update status dot
    const dot = group.getObjectByName("status-dot");
    if (dot instanceof THREE.Mesh) {
      (dot.material as THREE.MeshBasicMaterial).color.setHex(color);
    }

    // Update fallback sphere
    const sphere = group.getObjectByName("fallback-sphere");
    if (sphere instanceof THREE.Mesh) {
      (sphere.material as THREE.MeshStandardMaterial).color.setHex(color);
    }

    // Add subtle emissive tint to bot model meshes
    if (this.botTemplate) {
      group.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          child.name !== "status-dot" &&
          child.name !== "fallback-sphere"
        ) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat.emissive) {
            mat.emissive.setHex(color);
            mat.emissiveIntensity = 0.2;
          }
        }
      });
    }
  }

  // ── Private: Click handler ────────────────────────────────────

  private handleClick = (event: MouseEvent): void => {
    if (!this.renderer || !this.camera || !this.scene) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Force world matrix update so hit-box transforms are current
    this.scene.updateMatrixWorld();

    this.raycaster.setFromCamera(this.pointer, this.camera);

    // v3: detect click on character model
    if (isV3Theme(this.manifest) && this.characterModel && this.onCharacterClick) {
      const hitBox = this.characterModel.getObjectByName("character-hit-box");
      if (hitBox) {
        const intersects = this.raycaster.intersectObject(hitBox, false);
        if (intersects.length > 0) {
          this.onCharacterClick();
          return;
        }
      }
    }

    // Legacy: agent click detection
    if (!this.onAgentClick) return;

    // Raycast only against invisible hit-box meshes — avoids SkinnedMesh
    // raycasting issues with cloned GLB models that share skeleton refs.
    const hitBoxes: THREE.Object3D[] = [];
    for (const [, group] of this.agentGroups) {
      const hb = group.getObjectByName("hit-box");
      if (hb) hitBoxes.push(hb);
    }

    const intersects = this.raycaster.intersectObjects(hitBoxes, false);
    if (intersects.length === 0) return;

    // Walk up the parent chain to find the agent group
    let obj: THREE.Object3D | null = intersects[0].object;
    while (obj) {
      if (obj.userData.agentId) {
        this.onAgentClick(obj.userData.agentId as string);
        return;
      }
      obj = obj.parent;
    }
  };

  // ── Private: Dispose a group's GPU resources ──────────────────

  private disposeGroup(group: THREE.Group): void {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => disposeMaterial(m));
        } else {
          disposeMaterial(obj.material as THREE.Material);
        }
      }
      if (obj instanceof THREE.Sprite) {
        disposeMaterial(obj.material);
      }
    });
  }

  // ── Private: Render loop with lerp animation ──────────────────

  private startRenderLoop(): void {
    const tick = () => {
      const delta = this.clock.getDelta();

      // Update AnimationMixer (v3 character animations)
      if (this.mixer) {
        this.mixer.update(delta);
      }

      // v3: Walk-request movement (state machine driven)
      if (this.walkRequest && this.characterModel) {
        const current = this.characterModel.position;
        const direction = this.walkRequest.target.clone().sub(current);
        direction.y = 0;
        const distance = direction.length();

        if (distance > 0.05) {
          direction.normalize();
          const step = CHARACTER_MOVE_SPEED * delta;
          current.add(direction.multiplyScalar(Math.min(step, distance)));

          // Rotate character to face movement direction
          const lookTarget = new THREE.Vector3(
            this.walkRequest.target.x,
            current.y,
            this.walkRequest.target.z,
          );
          this.characterModel.lookAt(lookTarget);
        } else {
          // Arrived — snap to target and invoke callback
          current.set(this.walkRequest.target.x, current.y, this.walkRequest.target.z);
          const onArrival = this.walkRequest.onArrival;
          this.walkRequest = null;
          onArrival();
        }
      }

      // v3: Idle timer — auto-sleep after 30 minutes of idle
      if (this.characterState === "idle" && !this.walkRequest) {
        this.idleTimer += delta;
        if (this.idleTimer >= ThreeJSRenderer.IDLE_TIMEOUT) {
          this.transitionTo("sleeping");
        }
      }

      // Legacy: Lerp agent positions toward their targets
      for (const [id, group] of this.agentGroups) {
        const target = this.targetPositions.get(id);
        if (target) {
          group.position.lerp(target, LERP_FACTOR);
        }
      }

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
      this.animId = requestAnimationFrame(tick);
    };
    this.animId = requestAnimationFrame(tick);
  }
}
