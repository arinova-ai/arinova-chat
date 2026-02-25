import * as THREE from "three";
import type { OfficeRenderer } from "./types";
import type { Agent, AgentStatus } from "../types";
import type { ThemeManifest, ZoneDef, ZoneType } from "../theme-types";

// ── Constants ────────────────────────────────────────────────────
const CANVAS_W = 1920;
const CANVAS_H = 1080;
const WORLD_SCALE = 0.5;
const BOT_HEIGHT = 40;
const LERP_FACTOR = 0.08;

const DEFAULT_STATUS_COLORS: Record<AgentStatus, number> = {
  working: 0x16a34a,
  idle: 0xf59e0b,
  blocked: 0xdc2626,
  collaborating: 0x2563eb,
};

// ── Helpers ──────────────────────────────────────────────────────

function canvasToWorld(cx: number, cy: number): THREE.Vector3 {
  return new THREE.Vector3(
    (cx - CANVAS_W / 2) * WORLD_SCALE,
    0,
    (cy - CANVAS_H / 2) * WORLD_SCALE,
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
function createLabelSprite(text: string, color: string = "#e2e8f0"): THREE.Sprite {
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
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
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

  // Lerp animation targets
  private targetPositions = new Map<string, THREE.Vector3>();

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
    this.statusColors = parseStatusColors(manifest);

    // Scene
    this.scene = new THREE.Scene();
    const bgColorStr = manifest?.canvas?.background?.color;
    const bgColor = bgColorStr ? Number(bgColorStr) : 0x1a1a2e;
    this.scene.background = new THREE.Color(bgColor);
    this.scene.fog = new THREE.FogExp2(bgColor, 0.0006);

    // Camera
    this.setupCamera(width, height);

    // WebGL renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    // Lighting
    this.setupLights();

    // Ground plane
    this.createGround();

    // Zone floor markers
    this.drawZoneFloors();

    // Load GLB models (bot + furniture)
    await this.loadModels();

    // Place furniture from manifest
    this.placeFurniture();

    // Click handler
    this.renderer.domElement.addEventListener("click", this.handleClick);

    this.startRenderLoop();
  }

  // ── destroy ───────────────────────────────────────────────────

  destroy(): void {
    cancelAnimationFrame(this.animId);

    this.renderer?.domElement.removeEventListener("click", this.handleClick);

    // Traverse entire scene and dispose all GPU resources
    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => {
              (m as THREE.MeshStandardMaterial).map?.dispose();
              m.dispose();
            });
          } else {
            const mat = obj.material as THREE.MeshStandardMaterial;
            mat.map?.dispose();
            mat.dispose();
          }
        }
        if (obj instanceof THREE.Sprite) {
          obj.material.map?.dispose();
          obj.material.dispose();
        }
      });
    }

    this.agentGroups.clear();
    this.targetPositions.clear();
    this.botTemplate = null;

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
      const frustum = 500;
      const aspect = width / height;
      this.camera.left = -frustum * aspect;
      this.camera.right = frustum * aspect;
      this.camera.top = frustum;
      this.camera.bottom = -frustum;
      this.camera.updateProjectionMatrix();
    }
  }

  // ── updateAgents ──────────────────────────────────────────────

  updateAgents(agents: Agent[]): void {
    if (!this.scene) return;
    this.agents = agents;

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
      const startX = CANVAS_W / 2 - ((agents.length - 1) * spacing) / 2;
      agents.forEach((a, i) => {
        assignments.set(a.id, {
          x: startX + i * spacing,
          y: CANVAS_H / 2,
          seatId: `fallback-${i}`,
        });
      });
    }

    // Create or update agent groups
    for (const agent of agents) {
      const seat = assignments.get(agent.id);
      if (!seat) continue;
      const worldPos = canvasToWorld(seat.x, seat.y);
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

  // ── Private: Camera ───────────────────────────────────────────

  private setupCamera(w: number, h: number): void {
    const frustum = 500;
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

  // ── Private: Lighting ─────────────────────────────────────────

  private setupLights(): void {
    if (!this.scene) return;

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
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
  }

  // ── Private: Ground ───────────────────────────────────────────

  private createGround(): void {
    if (!this.scene) return;

    const w = CANVAS_W * WORLD_SCALE;
    const h = CANVAS_H * WORLD_SCALE;
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.9,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  // ── Private: Zone floor markers ───────────────────────────────

  private drawZoneFloors(): void {
    if (!this.scene || !this.manifest?.zones) return;

    for (const zone of this.manifest.zones) {
      const b = zone.bounds;
      const center = canvasToWorld(b.x + b.width / 2, b.y + b.height / 2);
      const w = b.width * WORLD_SCALE;
      const h = b.height * WORLD_SCALE;

      // Semi-transparent floor rectangle
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.85,
        transparent: true,
        opacity: 0.6,
      });
      const plane = new THREE.Mesh(geo, mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(center.x, 0.1, center.z);
      plane.receiveShadow = true;
      this.scene.add(plane);

      // Zone label sprite above the zone
      const label = createLabelSprite(zone.name, "#94a3b8");
      label.position.set(center.x, 55, center.z - h / 2 + 10);
      label.scale.set(50, 12, 1);
      this.scene.add(label);
    }
  }

  // ── Private: Load GLB models ──────────────────────────────────

  private async loadModels(): Promise<void> {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const loader = new GLTFLoader();

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

  // ── Private: Place furniture ──────────────────────────────────

  private placeFurniture(): void {
    if (!this.scene || !this.manifest?.furniture) return;

    for (const f of this.manifest.furniture) {
      if (!f.sprite?.endsWith(".glb")) continue;
      const template = this.furnitureScenes.get(f.sprite);
      if (!template) continue;

      const clone = template.clone();
      // Scale furniture: use width as target footprint in canvas space
      const targetSize = Math.max(f.width, f.height) * WORLD_SCALE * 0.5;
      normalizeModel(clone, targetSize);
      clone.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      const pos = canvasToWorld(f.x, f.y);
      clone.position.copy(pos);
      this.scene.add(clone);
    }
  }

  // ── Private: Create agent group ───────────────────────────────

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

    // Name label sprite
    const label = createLabelSprite(agent.name);
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

  // ── Private: Update agent color ───────────────────────────────

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
    if (!this.renderer || !this.camera || !this.scene || !this.onAgentClick) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    // Collect all meshes belonging to agent groups
    const meshes: THREE.Object3D[] = [];
    for (const [, group] of this.agentGroups) {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) meshes.push(child);
      });
    }

    const intersects = this.raycaster.intersectObjects(meshes, false);
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
          obj.material.forEach((m) => {
            (m as THREE.MeshStandardMaterial).map?.dispose();
            m.dispose();
          });
        } else {
          const mat = obj.material as THREE.MeshStandardMaterial;
          mat.map?.dispose();
          mat.dispose();
        }
      }
      if (obj instanceof THREE.Sprite) {
        obj.material.map?.dispose();
        obj.material.dispose();
      }
    });
  }

  // ── Private: Render loop with lerp animation ──────────────────

  private startRenderLoop(): void {
    const tick = () => {
      // Lerp agent positions toward their targets
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
