import type { OfficeRenderer } from "./types";
import type { Agent } from "../types";
import type { ThemeManifest } from "../theme-types";

/**
 * IframeRenderer — loads theme entry JS inside a sandboxed iframe
 * and communicates via postMessage / the SDK bridge.
 */
export class IframeRenderer implements OfficeRenderer {
  private iframe: HTMLIFrameElement | null = null;
  private container: HTMLDivElement | null = null;
  private agents: Agent[] = [];
  private selectedId: string | null = null;
  private messageHandler: ((e: MessageEvent) => void) | null = null;

  onAgentClick?: (agentId: string) => void;
  onCharacterClick?: () => void;

  async init(
    container: HTMLDivElement,
    width: number,
    height: number,
    manifest: ThemeManifest | null,
    themeId?: string,
    assetsBaseUrl?: string,
  ): Promise<void> {
    this.container = container;

    const iframe = document.createElement("iframe");
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    iframe.style.display = "block";
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");

    // Build the iframe src from the theme's entry file
    const base = assetsBaseUrl ?? "/themes";
    const tid = themeId ?? manifest?.id ?? "default";
    const entry = manifest?.entry ?? "theme.js";

    // The iframe loads a small HTML wrapper that includes the bridge + theme entry
    const cacheBust = `?v=${Date.now()}`;
    const bridgeUrl = `${base}/${tid}/bridge.js${cacheBust}`;
    const entryUrl = `${base}/${tid}/${entry}${cacheBust}`;

    const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent;}</style>
</head><body>
<div id="container" style="width:100%;height:100%;"></div>
<script>
// Minimal bridge stub — theme receives full SDK via postMessage init
window.__ARINOVA_SDK__ = {
  agents: [],
  _agentListeners: [],
  onAgentsChange: function(cb) {
    this._agentListeners.push(cb);
    return function() {
      var idx = window.__ARINOVA_SDK__._agentListeners.indexOf(cb);
      if (idx !== -1) window.__ARINOVA_SDK__._agentListeners.splice(idx, 1);
    };
  },
  getAgent: function(id) { return this.agents.find(function(a) { return a.id === id; }); },
  selectAgent: function(id) { window.parent.postMessage({ type: "arinova:selectAgent", agentId: id }, "*"); },
  openChat: function(id) { window.parent.postMessage({ type: "arinova:openChat", agentId: id }, "*"); },
  navigate: function(path) { window.parent.postMessage({ type: "arinova:navigate", path: path }, "*"); },
  emit: function(event, data) { window.parent.postMessage({ type: "arinova:emit", event: event, data: data }, "*"); },
  assetUrl: function(rel) {
    if (!rel) return "";
    return "${base}/${tid}/" + (rel.charAt(0) === "/" ? rel.slice(1) : rel);
  },
  loadJSON: function(rel) { return fetch(this.assetUrl(rel)).then(function(r) { return r.json(); }); },
  width: ${width},
  height: ${height},
  isMobile: ${width < 768},
  pixelRatio: window.devicePixelRatio || 1,
  themeId: "${tid}",
  themeVersion: "${manifest?.version ?? "0.0.0"}",
};

window.addEventListener("message", function(e) {
  if (!e.data || !e.data.type) return;
  if (e.data.type === "arinova:updateAgents") {
    window.__ARINOVA_SDK__.agents = e.data.agents;
    window.__ARINOVA_SDK__._agentListeners.forEach(function(cb) { try { cb(e.data.agents); } catch(err) { console.error(err); } });
  } else if (e.data.type === "arinova:resize") {
    window.__ARINOVA_SDK__.width = e.data.width;
    window.__ARINOVA_SDK__.height = e.data.height;
    window.__ARINOVA_SDK__.isMobile = e.data.width < 768;
    if (window.__ARINOVA_THEME__ && typeof window.__ARINOVA_THEME__.resize === "function") {
      window.__ARINOVA_THEME__.resize(e.data.width, e.data.height);
    }
  } else if (e.data.type === "arinova:selectAgent") {
    // host telling theme which agent is selected
  }
});

window.__ARINOVA_REGISTER_THEME__ = function(mod) {
  var m = mod.default || mod;
  window.__ARINOVA_THEME__ = m;
  if (typeof m.init === "function") {
    var result = m.init(window.__ARINOVA_SDK__, document.getElementById("container"));
    if (result && typeof result.catch === "function") result.catch(function(e) { console.error("[Theme]", e); });
  }
};
<\/script>
<script src="${bridgeUrl}" onerror="console.warn('No bridge.js found, using built-in bridge')"><\/script>
<script type="module">
import theme from "${entryUrl}";
window.__ARINOVA_REGISTER_THEME__(theme);
<\/script>
</body></html>`;

    iframe.srcdoc = html;
    container.appendChild(iframe);
    this.iframe = iframe;

    // Listen for messages from the iframe
    this.messageHandler = (e: MessageEvent) => {
      if (!e.data?.type) return;
      if (e.data.type === "arinova:selectAgent" && e.data.agentId) {
        this.onAgentClick?.(e.data.agentId);
      } else if (e.data.type === "arinova:characterClick") {
        this.onCharacterClick?.();
      }
    };
    window.addEventListener("message", this.messageHandler);
  }

  destroy(): void {
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
    this.container = null;
  }

  resize(width: number, height: number): void {
    this.iframe?.contentWindow?.postMessage(
      { type: "arinova:resize", width, height },
      "*",
    );
  }

  updateAgents(agents: Agent[]): void {
    this.agents = agents;
    this.iframe?.contentWindow?.postMessage(
      { type: "arinova:updateAgents", agents },
      "*",
    );
  }

  selectAgent(agentId: string | null): void {
    this.selectedId = agentId;
    this.iframe?.contentWindow?.postMessage(
      { type: "arinova:selectAgent", agentId },
      "*",
    );
  }
}
