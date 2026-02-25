import * as THREE from "three";
import type { OfficeRenderer } from "./types";
import type { Agent } from "../types";
import type { ThemeManifest } from "../theme-types";

// ── ThreeJSRenderer (skeleton) ──────────────────────────────────
// Minimal implementation: renders a lit scene with a ground plane
// and colored sphere markers for each agent. GLB model loading is
// stubbed out for future implementation.

export class ThreeJSRenderer implements OfficeRenderer {
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private container: HTMLDivElement | null = null;
  private animId = 0;
  private width = 0;
  private height = 0;

  private agents: Agent[] = [];
  private selectedAgentId: string | null = null;
  private agentMeshes = new Map<string, THREE.Mesh>();
  private agentLabels = new Map<string, THREE.Sprite>();

  onAgentClick?: (agentId: string) => void;

  // ── init ──────────────────────────────────────────────────────

  async init(
    container: HTMLDivElement,
    width: number,
    height: number,
    manifest: ThemeManifest | null,
    themeId?: string,
  ): Promise<void> {
    this.container = container;
    this.width = width;
    this.height = height;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Orthographic camera for top-down 2D-style view
    const frustum = 500;
    const aspect = width / height;
    this.camera = new THREE.OrthographicCamera(
      -frustum * aspect, frustum * aspect,
      frustum, -frustum,
      0.1, 2000,
    );
    this.camera.position.set(0, 800, 400);
    this.camera.lookAt(0, 0, 0);

    // WebGL renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(200, 500, 300);
    this.scene.add(directional);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(1000, 1000);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x2d3748 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // Future: load GLB scene model from theme
    // if (manifest && themeId) {
    //   const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    //   const loader = new GLTFLoader();
    //   const url = `/themes/${themeId}/scene.glb`;
    //   const gltf = await loader.loadAsync(url);
    //   this.scene.add(gltf.scene);
    // }

    this.startRenderLoop();
  }

  // ── destroy ───────────────────────────────────────────────────

  destroy(): void {
    cancelAnimationFrame(this.animId);

    // Traverse entire scene and dispose all GPU resources
    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            (obj.material as THREE.Material)?.dispose();
          }
        }
      });
    }

    this.agentMeshes.clear();
    this.agentLabels.clear();

    // Dispose renderer
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

    // Remove stale
    for (const [id, mesh] of this.agentMeshes) {
      if (!currentIds.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.agentMeshes.delete(id);

        const label = this.agentLabels.get(id);
        if (label) {
          this.scene.remove(label);
          label.material.map?.dispose();
          label.material.dispose();
          this.agentLabels.delete(id);
        }
      }
    }

    // Create / update
    const spacing = 80;
    const startX = -((agents.length - 1) * spacing) / 2;

    agents.forEach((agent, i) => {
      const x = startX + i * spacing;
      const z = 0;

      let mesh = this.agentMeshes.get(agent.id);
      if (!mesh) {
        const geo = new THREE.SphereGeometry(20, 16, 16);
        const mat = new THREE.MeshLambertMaterial({ color: this.statusColor(agent.status) });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, 20, z);
        this.scene!.add(mesh);
        this.agentMeshes.set(agent.id, mesh);
      } else {
        // Update color
        (mesh.material as THREE.MeshLambertMaterial).color.set(this.statusColor(agent.status));
        mesh.position.set(x, 20, z);
      }

      // Selection glow
      mesh.scale.setScalar(agent.id === this.selectedAgentId ? 1.3 : 1.0);
    });
  }

  // ── selectAgent ───────────────────────────────────────────────

  selectAgent(agentId: string | null): void {
    this.selectedAgentId = agentId;

    for (const [id, mesh] of this.agentMeshes) {
      mesh.scale.setScalar(id === agentId ? 1.3 : 1.0);
    }
  }

  // ── Private helpers ───────────────────────────────────────────

  private statusColor(status: string): number {
    switch (status) {
      case "working": return 0x16a34a;
      case "idle": return 0xf59e0b;
      case "blocked": return 0xdc2626;
      case "collaborating": return 0x2563eb;
      default: return 0x64748b;
    }
  }

  private startRenderLoop() {
    const tick = () => {
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
      this.animId = requestAnimationFrame(tick);
    };
    this.animId = requestAnimationFrame(tick);
  }
}
