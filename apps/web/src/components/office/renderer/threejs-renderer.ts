import * as THREE from "three";
import type { OfficeRenderer } from "./types";
import type { Agent, AgentStatus } from "../types";
import type { ThemeManifest, ZoneDef, ZoneType } from "../theme-types";

// ── Constants ────────────────────────────────────────────────────
const DEFAULT_CANVAS_W = 1920;
const DEFAULT_CANVAS_H = 1080;
const WORLD_SCALE = 0.5;
const BOT_HEIGHT = 40;
const LERP_FACTOR = 0.08;
const CHARACTER_MOVE_SPEED = 2; // units per second

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

  // ── v3: Click-to-walk ────────────────────────────────────────
  private walkTarget: THREE.Vector3 | null = null;
  private roomScene: THREE.Object3D | null = null;

  // ── DRACOLoader for compressed GLB models ──────────────────
  private dracoLoader: import("three/examples/jsm/loaders/DRACOLoader.js").DRACOLoader | null = null;

  // ── OrbitControls for pan/zoom ────────────────────────────
  private controls: import("three/examples/jsm/controls/OrbitControls.js").OrbitControls | null = null;
  /** Frustum computed by fitCameraToRoom(); used in resize(). */
  private v3Frustum: number | null = null;

  onAgentClick?: (agentId: string) => void;

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

    // Camera — v3 uses manifest camera config, legacy uses hardcoded
    if (isV3Theme(manifest)) {
      this.setupCameraV3(width, height);
    } else {
      this.setupCamera(width, height);
    }

    // WebGL renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
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

    this.startRenderLoop();
  }

  // ── destroy ───────────────────────────────────────────────────

  destroy(): void {
    cancelAnimationFrame(this.animId);

    this.renderer?.domElement.removeEventListener("click", this.handleClick);

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
    this.walkTarget = null;
    this.v3Frustum = null;

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

    // Ambient
    const ambientColor = lightConfig?.ambient?.color
      ? Number(lightConfig.ambient.color) : 0xfff5e6;
    const ambientIntensity = lightConfig?.ambient?.intensity ?? 0.7;
    this.scene.add(new THREE.AmbientLight(ambientColor, ambientIntensity));

    // Hemisphere for subtle variation
    this.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x362d22, 0.25));

    // Directional
    const dirColor = lightConfig?.directional?.color
      ? Number(lightConfig.directional.color) : 0xffffff;
    const dirIntensity = lightConfig?.directional?.intensity ?? 1.0;
    const dirPos = lightConfig?.directional?.position ?? [5, 8, 6];

    const dir = new THREE.DirectionalLight(dirColor, dirIntensity);
    dir.position.set(dirPos[0], dirPos[1], dirPos[2]);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -15;
    dir.shadow.camera.right = 15;
    dir.shadow.camera.top = 15;
    dir.shadow.camera.bottom = -15;
    dir.shadow.camera.near = 0.1;
    dir.shadow.camera.far = 50;
    this.scene.add(dir);

    // Soft fill from opposite side
    const fill = new THREE.DirectionalLight(0xc4d4ff, 0.3);
    fill.position.set(-5, 4, -3);
    this.scene.add(fill);
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
    this.camera.zoom = 1;
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

  private async loadRoomModel(): Promise<void> {
    if (!this.scene || !this.manifest?.room?.model) return;

    const loader = await this.createGLTFLoader();

    const roomUrl = `/themes/${this.manifest.id}/${this.manifest.room.model}`;
    try {
      const gltf = await loader.loadAsync(roomUrl);
      this.roomScene = gltf.scene;
      const scale = this.manifest.room.scale ?? [1, 1, 1];
      this.roomScene.scale.set(scale[0], scale[1], scale[2]);

      // Enable shadows on room meshes
      this.roomScene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
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
    const charUrl = `/themes/${this.manifest.id}/${this.manifest.character.model}`;
    try {
      const gltf = await loader.loadAsync(charUrl);
      this.characterModel = gltf.scene;

      const scale = this.manifest.character.scale ?? [1, 1, 1];
      this.characterModel.scale.set(scale[0], scale[1], scale[2]);

      // Enable shadows
      this.characterModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

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

    // Play idle animation by default (fall back to walk if no idle)
    if (this.animationClips["idle"]) {
      this.playAnimation("idle");
    } else if (Object.keys(this.animationClips).length > 0) {
      // Play any available animation
      const firstName = Object.keys(this.animationClips)[0];
      this.playAnimation(firstName);
    }
  }

  // ── Private: Play animation ───────────────────────────────────

  private playAnimation(name: string): void {
    if (!this.mixer) return;
    const clip = this.animationClips[name];
    if (!clip) return;

    if (this.currentAction) {
      this.currentAction.fadeOut(0.3);
    }

    const action = this.mixer.clipAction(clip);
    action.reset().fadeIn(0.3).play();
    this.currentAction = action;
  }

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

    // v3: click-to-walk — intersect room meshes to get floor position
    if (isV3Theme(this.manifest) && this.characterModel && this.roomScene) {
      const intersects = this.raycaster.intersectObjects(this.roomScene.children, true);
      if (intersects.length > 0) {
        const hit = intersects[0].point;
        this.walkTarget = new THREE.Vector3(hit.x, 0, hit.z);
        this.playAnimation("walk");
        return;
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

      // v3: Move character toward walk target
      if (this.walkTarget && this.characterModel) {
        const current = this.characterModel.position;
        const direction = this.walkTarget.clone().sub(current);
        direction.y = 0;
        const distance = direction.length();

        if (distance > 0.1) {
          direction.normalize();
          const step = CHARACTER_MOVE_SPEED * delta;
          current.add(direction.multiplyScalar(Math.min(step, distance)));

          // Rotate character to face movement direction
          const lookTarget = new THREE.Vector3(
            this.walkTarget.x,
            current.y,
            this.walkTarget.z,
          );
          this.characterModel.lookAt(lookTarget);
        } else {
          // Arrived at target
          this.walkTarget = null;
          if (this.animationClips["idle"]) {
            this.playAnimation("idle");
          }
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
