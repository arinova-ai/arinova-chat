import type { ThemeManifest } from "../theme-types";
import type { Agent } from "../types";

export interface OfficeRenderer {
  /** Set up the rendering engine inside the container element. */
  init(
    container: HTMLDivElement,
    width: number,
    height: number,
    manifest: ThemeManifest | null,
    themeId?: string,
  ): Promise<void>;

  /** Tear down the renderer and free all resources. */
  destroy(): void;

  /** Resize the canvas / viewport. */
  resize(width: number, height: number): void;

  /** Sync the full list of agents (add / remove / update). */
  updateAgents(agents: Agent[]): void;

  /** Highlight (or clear) the selected agent. */
  selectAgent(agentId: string | null): void;

  /** Callback invoked when the user clicks an agent. */
  onAgentClick?: (agentId: string) => void;

  /** Callback invoked when the user clicks the v3 character model. */
  onCharacterClick?: () => void;
}
