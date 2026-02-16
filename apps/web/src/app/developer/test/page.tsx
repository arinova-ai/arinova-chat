"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Play,
  RotateCcw,
  Send,
  Trash2,
  Monitor,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Globe,
  FileJson,
  FlaskConical,
  Terminal,
  Activity,
  Gamepad2,
  XCircle,
  ArrowDownRight,
  ArrowUpRight,
  Pause,
  StepForward,
  Bomb,
  Info,
  Copy,
  Loader2,
} from "lucide-react";
import type {
  AppManifest,
  ControlMode,
} from "@arinova/shared/types";

// ===== Types =====

interface LogEntry {
  id: number;
  timestamp: Date;
  direction: "sent" | "received";
  type: string;
  payload: unknown;
}

interface AppAction {
  name: string;
  description: string;
  params?: Record<string, unknown>;
  humanOnly?: boolean;
  agentOnly?: boolean;
}

interface ValidationError {
  field: string;
  message: string;
}

// ===== Manifest Validation =====

function validateManifest(manifest: unknown): { valid: boolean; errors: ValidationError[]; warnings: string[] } {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  if (!manifest || typeof manifest !== "object") {
    errors.push({ field: "root", message: "Manifest must be a JSON object" });
    return { valid: false, errors, warnings };
  }

  const m = manifest as Record<string, unknown>;

  // Required top-level fields
  const requiredFields = [
    "manifest_version",
    "id",
    "name",
    "version",
    "description",
    "author",
    "category",
    "ui",
    "permissions",
    "interaction",
    "agentInterface",
    "monetization",
    "rating",
    "platforms",
    "players",
    "roles",
    "tags",
    "icon",
  ];

  for (const field of requiredFields) {
    if (m[field] === undefined || m[field] === null) {
      errors.push({ field, message: `Missing required field: ${field}` });
    }
  }

  // Validate author
  if (m.author && typeof m.author === "object") {
    const author = m.author as Record<string, unknown>;
    if (!author.name) {
      errors.push({ field: "author.name", message: "author.name is required" });
    }
  } else if (m.author !== undefined) {
    errors.push({ field: "author", message: "author must be an object with a name field" });
  }

  // Validate ui
  if (m.ui && typeof m.ui === "object") {
    const ui = m.ui as Record<string, unknown>;
    if (!ui.entry) {
      errors.push({ field: "ui.entry", message: "ui.entry is required" });
    }
    if (ui.viewport && typeof ui.viewport === "object") {
      const vp = ui.viewport as Record<string, unknown>;
      if (typeof vp.minWidth !== "number") errors.push({ field: "ui.viewport.minWidth", message: "ui.viewport.minWidth must be a number" });
      if (typeof vp.maxWidth !== "number") errors.push({ field: "ui.viewport.maxWidth", message: "ui.viewport.maxWidth must be a number" });
      if (!vp.aspectRatio) errors.push({ field: "ui.viewport.aspectRatio", message: "ui.viewport.aspectRatio is required" });
      if (!vp.orientation) errors.push({ field: "ui.viewport.orientation", message: "ui.viewport.orientation is required" });
    } else {
      errors.push({ field: "ui.viewport", message: "ui.viewport is required" });
    }
  }

  // Validate interaction
  if (m.interaction && typeof m.interaction === "object") {
    const inter = m.interaction as Record<string, unknown>;
    if (!Array.isArray(inter.controlModes) || inter.controlModes.length === 0) {
      errors.push({ field: "interaction.controlModes", message: "interaction.controlModes must be a non-empty array" });
    }
    if (!inter.defaultMode) {
      errors.push({ field: "interaction.defaultMode", message: "interaction.defaultMode is required" });
    }
  }

  // Validate category
  const validCategories = ["game", "shopping", "tool", "social", "other"];
  if (m.category && !validCategories.includes(m.category as string)) {
    warnings.push(`Category "${m.category}" is not standard. Valid: ${validCategories.join(", ")}`);
  }

  // Check permissions
  if (Array.isArray(m.permissions)) {
    const knownPermissions = ["storage", "network", "audio", "camera", "notifications"];
    for (const perm of m.permissions as string[]) {
      if (!knownPermissions.includes(perm)) {
        warnings.push(`Unknown permission: "${perm}"`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function getPermissionTier(manifest: AppManifest): number {
  const perms = manifest.permissions;
  if (perms.includes("camera") || perms.includes("notifications")) return 2;
  if (perms.includes("network") || perms.includes("audio")) return 1;
  return 0;
}

// ===== Tab Component =====

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-2 text-xs font-medium transition-colors border-b-2 whitespace-nowrap",
        active
          ? "border-blue-500 text-blue-400"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-neutral-600"
      )}
    >
      {children}
    </button>
  );
}

// ===== Main Page Component =====

export default function TestSandboxPage() {
  // ----- App loading state -----
  const [loadMode, setLoadMode] = useState<"url" | "manifest">("url");
  const [appUrl, setAppUrl] = useState("");
  const [manifestJson, setManifestJson] = useState("");
  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: ValidationError[];
    warnings: string[];
  } | null>(null);
  const [appLoaded, setAppLoaded] = useState(false);
  const [iframeUrl, setIframeUrl] = useState("");
  const [iframeLoading, setIframeLoading] = useState(false);

  // ----- Dev tools state -----
  const [activeTab, setActiveTab] = useState<"state" | "log" | "control" | "console">("state");
  const [controlMode, setControlMode] = useState<ControlMode>("agent");
  const [appState, setAppState] = useState<Record<string, unknown>>({});
  const [appActions, setAppActions] = useState<AppAction[]>([]);
  const [roleStates, setRoleStates] = useState<
    Record<string, { state: Record<string, unknown>; actions: AppAction[] }>
  >({});
  const [eventLog, setEventLog] = useState<LogEntry[]>([]);
  const [actionParamsInput, setActionParamsInput] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<
    Array<{ id: string; name: string; price: number; icon?: string }>
  >([]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logIdCounter = useRef(0);

  // ----- Logging -----

  const addToLog = useCallback(
    (direction: "sent" | "received", payload: unknown) => {
      const type =
        payload && typeof payload === "object" && "type" in payload
          ? (payload as Record<string, unknown>).type as string
          : "unknown";

      setEventLog((prev) => [
        ...prev,
        {
          id: ++logIdCounter.current,
          timestamp: new Date(),
          direction,
          type,
          payload,
        },
      ]);
    },
    []
  );

  // Auto-scroll event log
  useEffect(() => {
    if (activeTab === "log") {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [eventLog, activeTab]);

  // ----- PostMessage Bridge -----

  const sendToApp = useCallback(
    (data: Record<string, unknown>) => {
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(data, "*");
        addToLog("sent", data);
      }
    },
    [addToLog]
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object" || data.source !== "arinova-app") return;

      addToLog("received", data);

      switch (data.type) {
        case "set_context":
          setAppState((data.state as Record<string, unknown>) ?? {});
          setAppActions(
            (data.actions as AppAction[]) ?? []
          );
          break;

        case "set_context_for_role": {
          const role = data.role as string;
          setRoleStates((prev) => ({
            ...prev,
            [role]: {
              state: (data.state as Record<string, unknown>) ?? {},
              actions: (data.actions as AppAction[]) ?? [],
            },
          }));
          break;
        }

        case "event":
          // Already logged above
          break;

        case "human_action":
          // Already logged above
          break;

        case "register_products":
          setProducts(
            (data.products as Array<{
              id: string;
              name: string;
              price: number;
              icon?: string;
            }>) ?? []
          );
          break;

        case "request_purchase": {
          // Auto-approve purchases in test mode
          const requestId = data.requestId as string;
          const productId = data.productId as string;
          sendToApp({
            type: "purchase_response",
            requestId,
            success: true,
            receipt: {
              receiptId: `test-receipt-${Date.now()}`,
              productId,
              timestamp: Date.now(),
            },
          });
          break;
        }
      }
    },
    [addToLog, sendToApp]
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  // ----- iframe lifecycle -----

  const handleIframeLoad = useCallback(() => {
    setIframeLoading(false);
    sendToApp({ type: "ready" });
    sendToApp({ type: "control_mode_changed", mode: controlMode });
  }, [sendToApp, controlMode]);

  // ----- Load handlers -----

  const loadFromUrl = useCallback(() => {
    if (!appUrl.trim()) return;

    let url = appUrl.trim();
    // If manifest was pasted, use it; otherwise we run without manifest validation
    let parsedManifest: AppManifest | null = manifest;

    if (manifestJson.trim()) {
      try {
        const parsed = JSON.parse(manifestJson.trim());
        const result = validateManifest(parsed);
        setValidationResult(result);
        if (result.valid) {
          parsedManifest = parsed as AppManifest;
          setManifest(parsedManifest);
        }
      } catch {
        setValidationResult({
          valid: false,
          errors: [{ field: "json", message: "Invalid JSON" }],
          warnings: [],
        });
        return;
      }
    } else {
      setValidationResult(null);
    }

    // Ensure URL has protocol
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "http://" + url;
    }

    setManifest(parsedManifest);
    setIframeUrl(url);
    setIframeLoading(true);
    setAppLoaded(true);
    setAppState({});
    setAppActions([]);
    setRoleStates({});
    setProducts([]);
    setEventLog([]);
  }, [appUrl, manifestJson, manifest]);

  const loadFromManifest = useCallback(() => {
    if (!manifestJson.trim()) return;

    try {
      const parsed = JSON.parse(manifestJson.trim());
      const result = validateManifest(parsed);
      setValidationResult(result);

      if (!result.valid) return;

      const m = parsed as AppManifest;
      setManifest(m);

      // Need a URL to load
      if (!appUrl.trim()) {
        setValidationResult({
          valid: false,
          errors: [{ field: "url", message: "Enter the app URL above to load the app" }],
          warnings: result.warnings,
        });
        return;
      }

      let url = appUrl.trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "http://" + url;
      }

      setIframeUrl(url);
      setIframeLoading(true);
      setAppLoaded(true);
      setAppState({});
      setAppActions([]);
      setRoleStates({});
      setProducts([]);
      setEventLog([]);
    } catch {
      setValidationResult({
        valid: false,
        errors: [{ field: "json", message: "Invalid JSON — could not parse manifest" }],
        warnings: [],
      });
    }
  }, [manifestJson, appUrl]);

  const reloadIframe = useCallback(() => {
    if (!iframeUrl) return;
    setIframeLoading(true);
    setAppState({});
    setAppActions([]);
    setRoleStates({});
    setProducts([]);
    // Force reload by toggling the src
    const iframe = iframeRef.current;
    if (iframe) {
      const current = iframe.src;
      iframe.src = "about:blank";
      requestAnimationFrame(() => {
        iframe.src = current;
      });
    }
  }, [iframeUrl]);

  const unloadApp = useCallback(() => {
    sendToApp({ type: "destroy" });
    setIframeUrl("");
    setAppLoaded(false);
    setManifest(null);
    setIframeLoading(false);
    setAppState({});
    setAppActions([]);
    setRoleStates({});
    setProducts([]);
    setEventLog([]);
    setValidationResult(null);
  }, [sendToApp]);

  // ----- Action dispatch -----

  const dispatchAction = useCallback(
    (actionName: string) => {
      const rawParams = actionParamsInput[actionName]?.trim();
      let params: Record<string, unknown> = {};
      if (rawParams) {
        try {
          params = JSON.parse(rawParams);
        } catch {
          addToLog("sent", {
            type: "error",
            message: `Invalid JSON params for action "${actionName}"`,
          });
          return;
        }
      }
      sendToApp({ type: "action", name: actionName, params });
    },
    [actionParamsInput, sendToApp, addToLog]
  );

  // ----- Control mode switch -----

  const switchControlMode = useCallback(
    (mode: ControlMode) => {
      setControlMode(mode);
      if (appLoaded) {
        sendToApp({ type: "control_mode_changed", mode });
      }
    },
    [appLoaded, sendToApp]
  );

  // ----- Computed values -----

  const aspectRatio = manifest?.ui?.viewport?.aspectRatio
    ? (() => {
        const parts = manifest.ui.viewport.aspectRatio.split(":").map(Number);
        return parts.length === 2 && parts[0] > 0 && parts[1] > 0
          ? `${parts[0]}/${parts[1]}`
          : "16/9";
      })()
    : "16/9";

  const permissionTier = manifest ? getPermissionTier(manifest) : null;

  // ===== Render =====

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <FlaskConical className="h-6 w-6 text-blue-400" />
          <h1 className="text-2xl font-bold">Test Sandbox</h1>
        </div>
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-300">
          <strong>Test Sandbox</strong> — Apps loaded here run in a sandboxed iframe. Use a local dev
          server (e.g., <code className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-xs">http://localhost:8080</code>) for
          the best development experience.
        </div>
      </div>

      {/* App Loading Section */}
      <div className="mb-6 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Monitor className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Load App
          </h2>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setLoadMode("url")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              loadMode === "url"
                ? "bg-blue-600 text-white"
                : "bg-neutral-800 text-muted-foreground hover:text-foreground"
            )}
          >
            <Globe className="h-4 w-4" />
            Enter URL
          </button>
          <button
            onClick={() => setLoadMode("manifest")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              loadMode === "manifest"
                ? "bg-blue-600 text-white"
                : "bg-neutral-800 text-muted-foreground hover:text-foreground"
            )}
          >
            <FileJson className="h-4 w-4" />
            Paste Manifest
          </button>
        </div>

        {/* URL Input (always visible) */}
        <div className="flex gap-2 mb-3">
          <Input
            type="url"
            value={appUrl}
            onChange={(e) => setAppUrl(e.target.value)}
            placeholder="http://localhost:8080"
            className="bg-neutral-800 border-neutral-700 font-mono text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                loadFromUrl();
              }
            }}
          />
          <Button
            onClick={loadFromUrl}
            disabled={!appUrl.trim() || iframeLoading}
            className="gap-2 shrink-0"
          >
            {iframeLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Load
          </Button>
          {appLoaded && (
            <Button variant="outline" onClick={unloadApp} className="gap-2 shrink-0">
              <XCircle className="h-4 w-4" />
              Unload
            </Button>
          )}
        </div>

        {/* Manifest JSON (shown when mode = manifest, or collapsible) */}
        {loadMode === "manifest" && (
          <div className="mt-3">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Manifest JSON (optional — paste to enable validation and viewport config)
            </label>
            <Textarea
              value={manifestJson}
              onChange={(e) => setManifestJson(e.target.value)}
              placeholder='{\n  "manifest_version": 1,\n  "id": "my-app",\n  "name": "My App",\n  ...\n}'
              className="bg-neutral-800 border-neutral-700 font-mono text-xs min-h-[120px]"
              rows={6}
            />
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!manifestJson.trim()) return;
                  try {
                    const parsed = JSON.parse(manifestJson.trim());
                    const result = validateManifest(parsed);
                    setValidationResult(result);
                    if (result.valid) {
                      setManifest(parsed as AppManifest);
                    }
                  } catch {
                    setValidationResult({
                      valid: false,
                      errors: [{ field: "json", message: "Invalid JSON" }],
                      warnings: [],
                    });
                  }
                }}
                className="gap-1.5"
              >
                <CheckCircle2 className="h-3 w-3" />
                Validate
              </Button>
              <Button
                size="sm"
                onClick={loadFromManifest}
                disabled={!manifestJson.trim() || !appUrl.trim()}
                className="gap-1.5"
              >
                <Play className="h-3 w-3" />
                Validate & Load
              </Button>
            </div>
          </div>
        )}

        {/* Validation Results */}
        {validationResult && (
          <div className="mt-3 space-y-2">
            {validationResult.errors.length > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-4 w-4 text-red-400" />
                  <span className="text-sm font-medium text-red-400">
                    Validation Errors ({validationResult.errors.length})
                  </span>
                </div>
                <ul className="space-y-1">
                  {validationResult.errors.map((err, i) => (
                    <li key={i} className="text-xs text-red-300">
                      <code className="text-red-400">{err.field}</code>: {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {validationResult.warnings.length > 0 && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  <span className="text-sm font-medium text-yellow-400">
                    Warnings ({validationResult.warnings.length})
                  </span>
                </div>
                <ul className="space-y-1">
                  {validationResult.warnings.map((warn, i) => (
                    <li key={i} className="text-xs text-yellow-300">
                      {warn}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {validationResult.valid && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                  <span className="text-sm font-medium text-green-400">Manifest is valid</span>
                  {permissionTier !== null && (
                    <span
                      className={cn(
                        "ml-2 rounded-full px-2 py-0.5 text-xs font-medium",
                        permissionTier === 0
                          ? "bg-green-500/10 text-green-400"
                          : permissionTier === 1
                            ? "bg-yellow-500/10 text-yellow-400"
                            : "bg-red-500/10 text-red-400"
                      )}
                    >
                      Tier {permissionTier}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content: Split Panels or Quick Start */}
      {!appLoaded ? (
        /* Quick Start Guide */
        <div className="rounded-xl border border-border bg-card p-8">
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-800">
              <FlaskConical className="h-8 w-8 text-blue-400" />
            </div>
            <h2 className="mb-2 text-xl font-bold">Quick Start</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Get your app running in the test sandbox in 4 easy steps.
            </p>

            <div className="space-y-4 text-left">
              <div className="flex gap-4 rounded-lg bg-neutral-800/50 p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold">
                  1
                </div>
                <div>
                  <p className="text-sm font-medium">Create your app</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Build your app with <code className="rounded bg-neutral-700 px-1 py-0.5 font-mono text-xs">manifest.json</code> and{" "}
                    <code className="rounded bg-neutral-700 px-1 py-0.5 font-mono text-xs">index.html</code>. Include the{" "}
                    <code className="rounded bg-neutral-700 px-1 py-0.5 font-mono text-xs">@arinova/app-sdk</code> in your HTML.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 rounded-lg bg-neutral-800/50 p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold">
                  2
                </div>
                <div>
                  <p className="text-sm font-medium">Start a local server</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Serve your app directory locally:
                  </p>
                  <div className="mt-2 flex items-center gap-2 rounded bg-neutral-900 px-3 py-2 font-mono text-xs text-green-400">
                    <Terminal className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span>npx serve ./my-app -l 8080</span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Or use{" "}
                    <code className="rounded bg-neutral-700 px-1 py-0.5 font-mono text-xs">python -m http.server 8080</code>,{" "}
                    <code className="rounded bg-neutral-700 px-1 py-0.5 font-mono text-xs">live-server</code>, or any static file server.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 rounded-lg bg-neutral-800/50 p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold">
                  3
                </div>
                <div>
                  <p className="text-sm font-medium">Enter the URL above and click Load</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Type{" "}
                    <code className="rounded bg-neutral-700 px-1 py-0.5 font-mono text-xs">http://localhost:8080</code>{" "}
                    in the URL field and press <strong>Load</strong>. Optionally paste your manifest.json for
                    validation and viewport configuration.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 rounded-lg bg-neutral-800/50 p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold">
                  4
                </div>
                <div>
                  <p className="text-sm font-medium">Interact with your app</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use the Developer Tools panel on the right to inspect state, trigger actions, view the
                    event log, and switch control modes — simulating what agents and users will see.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Split Layout: Preview + DevTools */
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left Panel: App Preview */}
          <div className="lg:w-[60%] shrink-0">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Preview Header */}
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">
                    {manifest?.name ?? "App Preview"}
                  </span>
                  {manifest?.version && (
                    <span className="text-xs text-muted-foreground shrink-0">v{manifest.version}</span>
                  )}
                  {permissionTier !== null && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0",
                        permissionTier === 0
                          ? "bg-green-500/10 text-green-400"
                          : permissionTier === 1
                            ? "bg-yellow-500/10 text-yellow-400"
                            : "bg-red-500/10 text-red-400"
                      )}
                    >
                      Tier {permissionTier}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button variant="ghost" size="icon-xs" onClick={reloadIframe} title="Reload app">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => sendToApp({ type: "pause" })}
                    title="Send pause event"
                  >
                    <Pause className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => sendToApp({ type: "resume" })}
                    title="Send resume event"
                  >
                    <StepForward className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => sendToApp({ type: "destroy" })}
                    title="Send destroy event"
                  >
                    <Bomb className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Iframe Container */}
              <div className="relative bg-black flex items-center justify-center p-4">
                <div
                  className="relative overflow-hidden rounded bg-neutral-950 w-full"
                  style={{
                    aspectRatio,
                    maxWidth: manifest?.ui?.viewport?.maxWidth ?? 800,
                    minWidth: Math.min(manifest?.ui?.viewport?.minWidth ?? 320, 320),
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    src={iframeUrl}
                    sandbox="allow-scripts allow-same-origin"
                    onLoad={handleIframeLoad}
                    className="h-full w-full border-0"
                    title={manifest?.name ?? "Test App"}
                  />
                  {iframeLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                      <div className="text-center">
                        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                        <p className="mt-3 text-sm text-muted-foreground">Loading app...</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Viewport Info */}
              {manifest?.ui?.viewport && (
                <div className="border-t border-border px-4 py-2 flex items-center gap-4 text-[11px] text-muted-foreground">
                  <span>
                    Viewport: {manifest.ui.viewport.minWidth}px &ndash; {manifest.ui.viewport.maxWidth}px
                  </span>
                  <span>Aspect: {manifest.ui.viewport.aspectRatio}</span>
                  <span>Orientation: {manifest.ui.viewport.orientation}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Dev Tools */}
          <div className="lg:w-[40%] min-w-0">
            <div className="rounded-xl border border-border bg-card overflow-hidden h-full flex flex-col">
              {/* Tabs Header */}
              <div className="flex border-b border-border overflow-x-auto scrollbar-none">
                <TabButton active={activeTab === "state"} onClick={() => setActiveTab("state")}>
                  <span className="flex items-center gap-1.5">
                    <Activity className="h-3 w-3" />
                    State & Actions
                  </span>
                </TabButton>
                <TabButton active={activeTab === "log"} onClick={() => setActiveTab("log")}>
                  <span className="flex items-center gap-1.5">
                    <Terminal className="h-3 w-3" />
                    Event Log
                    {eventLog.length > 0 && (
                      <span className="rounded-full bg-neutral-700 px-1.5 py-0.5 text-[10px]">
                        {eventLog.length}
                      </span>
                    )}
                  </span>
                </TabButton>
                <TabButton active={activeTab === "control"} onClick={() => setActiveTab("control")}>
                  <span className="flex items-center gap-1.5">
                    <Gamepad2 className="h-3 w-3" />
                    Control
                  </span>
                </TabButton>
                <TabButton active={activeTab === "console"} onClick={() => setActiveTab("console")}>
                  <span className="flex items-center gap-1.5">
                    <Terminal className="h-3 w-3" />
                    Console
                  </span>
                </TabButton>
              </div>

              {/* Tab Content */}
              <div className="flex-1 min-h-0">
                {/* Tab: State & Actions */}
                {activeTab === "state" && (
                  <ScrollArea className="h-[500px]">
                    <div className="p-4 space-y-4">
                      {/* App State */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            App State
                          </h3>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => {
                              navigator.clipboard.writeText(
                                JSON.stringify(appState, null, 2)
                              );
                            }}
                            title="Copy state"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <pre className="rounded-lg bg-neutral-900 p-3 text-xs font-mono text-green-400 overflow-x-auto max-h-[200px] overflow-y-auto">
                          {Object.keys(appState).length > 0
                            ? JSON.stringify(appState, null, 2)
                            : "{ }  — No state received yet"}
                        </pre>
                      </div>

                      {/* Role States */}
                      {Object.keys(roleStates).length > 0 && (
                        <div>
                          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Role States
                          </h3>
                          {Object.entries(roleStates).map(([role, data]) => (
                            <div key={role} className="mb-3">
                              <p className="mb-1 text-xs font-medium text-blue-400">
                                {role}
                              </p>
                              <pre className="rounded-lg bg-neutral-900 p-3 text-xs font-mono text-green-400 overflow-x-auto max-h-[150px] overflow-y-auto">
                                {JSON.stringify(data.state, null, 2)}
                              </pre>
                              {data.actions.length > 0 && (
                                <div className="mt-2 space-y-1.5">
                                  {data.actions.map((action) => (
                                    <div
                                      key={`${role}-${action.name}`}
                                      className="rounded bg-neutral-800 px-3 py-2"
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium">{action.name}</span>
                                        <Button
                                          size="xs"
                                          variant="outline"
                                          onClick={() => dispatchAction(action.name)}
                                          className="gap-1"
                                        >
                                          <Send className="h-3 w-3" />
                                          Run
                                        </Button>
                                      </div>
                                      <p className="text-[11px] text-muted-foreground mt-0.5">
                                        {action.description}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      <div>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Actions ({appActions.length})
                        </h3>
                        {appActions.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No actions registered yet. The app will register actions via{" "}
                            <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[10px]">
                              setContext()
                            </code>.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {appActions.map((action) => (
                              <div
                                key={action.name}
                                className="rounded-lg border border-neutral-800 bg-neutral-900 p-3"
                              >
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-semibold font-mono">
                                        {action.name}
                                      </span>
                                      {action.humanOnly && (
                                        <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-400">
                                          human only
                                        </span>
                                      )}
                                      {action.agentOnly && (
                                        <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-400">
                                          agent only
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                      {action.description}
                                    </p>
                                  </div>
                                </div>

                                {/* Params Input */}
                                {action.params && Object.keys(action.params).length > 0 && (
                                  <div className="mt-2">
                                    <label className="text-[10px] text-muted-foreground block mb-1">
                                      Params (JSON):
                                    </label>
                                    <Input
                                      value={actionParamsInput[action.name] ?? ""}
                                      onChange={(e) =>
                                        setActionParamsInput((prev) => ({
                                          ...prev,
                                          [action.name]: e.target.value,
                                        }))
                                      }
                                      placeholder='{}'
                                      className="bg-neutral-800 border-neutral-700 font-mono text-xs h-7"
                                    />
                                  </div>
                                )}

                                <div className="mt-2 flex justify-end">
                                  <Button
                                    size="xs"
                                    onClick={() => dispatchAction(action.name)}
                                    className="gap-1"
                                  >
                                    <Send className="h-3 w-3" />
                                    Execute
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Products */}
                      {products.length > 0 && (
                        <div>
                          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Registered Products
                          </h3>
                          <div className="space-y-1.5">
                            {products.map((product) => (
                              <div
                                key={product.id}
                                className="flex items-center justify-between rounded bg-neutral-800 px-3 py-2"
                              >
                                <div className="flex items-center gap-2">
                                  {product.icon && <span>{product.icon}</span>}
                                  <span className="text-xs font-medium">{product.name}</span>
                                </div>
                                <span className="text-xs text-yellow-400 font-mono">
                                  {product.price} coins
                                </span>
                              </div>
                            ))}
                          </div>
                          <p className="mt-2 text-[10px] text-muted-foreground">
                            Purchases are auto-approved in test mode.
                          </p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}

                {/* Tab: Event Log */}
                {activeTab === "log" && (
                  <div className="flex flex-col h-[500px]">
                    <div className="flex items-center justify-between border-b border-border px-3 py-2">
                      <span className="text-xs text-muted-foreground">
                        {eventLog.length} event{eventLog.length !== 1 ? "s" : ""}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setEventLog([])}
                        title="Clear log"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="p-2 space-y-1">
                        {eventLog.length === 0 ? (
                          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                            No events yet. Events will appear here as your app communicates with the
                            platform.
                          </p>
                        ) : (
                          eventLog.map((entry) => (
                            <LogEntryRow key={entry.id} entry={entry} />
                          ))
                        )}
                        <div ref={logEndRef} />
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {/* Tab: Control Mode */}
                {activeTab === "control" && (
                  <div className="p-4 space-y-4">
                    <div>
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Control Mode
                      </h3>
                      <p className="mb-4 text-xs text-muted-foreground">
                        Switch the control mode to simulate how the app behaves under different interaction
                        contexts. The app receives a{" "}
                        <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[10px]">
                          control_mode_changed
                        </code>{" "}
                        event when you switch.
                      </p>

                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            {
                              mode: "agent" as const,
                              label: "Agent",
                              desc: "AI controls the app",
                              color: "blue",
                            },
                            {
                              mode: "human" as const,
                              label: "Human",
                              desc: "User controls directly",
                              color: "green",
                            },
                            {
                              mode: "copilot" as const,
                              label: "Copilot",
                              desc: "AI + human collaborate",
                              color: "purple",
                            },
                          ] as const
                        ).map(({ mode, label, desc, color }) => (
                          <button
                            key={mode}
                            onClick={() => switchControlMode(mode)}
                            className={cn(
                              "flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 transition-all",
                              controlMode === mode
                                ? color === "blue"
                                  ? "border-blue-500 bg-blue-500/10"
                                  : color === "green"
                                    ? "border-green-500 bg-green-500/10"
                                    : "border-purple-500 bg-purple-500/10"
                                : "border-neutral-800 bg-neutral-800/50 hover:border-neutral-700"
                            )}
                          >
                            <Gamepad2
                              className={cn(
                                "h-5 w-5",
                                controlMode === mode
                                  ? color === "blue"
                                    ? "text-blue-400"
                                    : color === "green"
                                      ? "text-green-400"
                                      : "text-purple-400"
                                  : "text-muted-foreground"
                              )}
                            />
                            <span className="text-xs font-medium">{label}</span>
                            <span className="text-[10px] text-muted-foreground text-center">
                              {desc}
                            </span>
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 rounded-lg bg-neutral-800 px-3 py-2">
                        <p className="text-xs text-muted-foreground">
                          Current mode:{" "}
                          <span
                            className={cn(
                              "font-semibold",
                              controlMode === "agent"
                                ? "text-blue-400"
                                : controlMode === "human"
                                  ? "text-green-400"
                                  : "text-purple-400"
                            )}
                          >
                            {controlMode}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Available control modes from manifest */}
                    {manifest?.interaction?.controlModes && (
                      <div>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Manifest Config
                        </h3>
                        <div className="space-y-1.5 text-xs text-muted-foreground">
                          <p>
                            Supported modes:{" "}
                            <span className="font-mono text-foreground">
                              {manifest.interaction.controlModes.join(", ")}
                            </span>
                          </p>
                          <p>
                            Default mode:{" "}
                            <span className="font-mono text-foreground">
                              {manifest.interaction.defaultMode}
                            </span>
                          </p>
                          <p>
                            Human input:{" "}
                            <span className="font-mono text-foreground">
                              {manifest.interaction.humanInput}
                            </span>
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Manual message sender */}
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Send Custom Message
                      </h3>
                      <p className="mb-2 text-[11px] text-muted-foreground">
                        Send a raw postMessage to the app (JSON format).
                      </p>
                      <CustomMessageSender onSend={sendToApp} />
                    </div>
                  </div>
                )}

                {/* Tab: Console */}
                {activeTab === "console" && (
                  <div className="p-4">
                    <div className="flex items-start gap-3 rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
                      <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                      <div className="space-y-3">
                        <div>
                          <h3 className="text-sm font-medium">Browser DevTools Console</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Open your browser&apos;s Developer Tools to see console output from the
                            sandboxed iframe.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">How to open:</p>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <ChevronRight className="h-3 w-3 text-blue-400" />
                              <span>
                                <kbd className="rounded bg-neutral-700 px-1.5 py-0.5 font-mono text-[10px]">
                                  F12
                                </kbd>{" "}
                                or{" "}
                                <kbd className="rounded bg-neutral-700 px-1.5 py-0.5 font-mono text-[10px]">
                                  Cmd+Option+I
                                </kbd>{" "}
                                (Mac) /{" "}
                                <kbd className="rounded bg-neutral-700 px-1.5 py-0.5 font-mono text-[10px]">
                                  Ctrl+Shift+I
                                </kbd>{" "}
                                (Windows/Linux)
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <ChevronRight className="h-3 w-3 text-blue-400" />
                              <span>
                                Navigate to the <strong>Console</strong> tab
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <ChevronRight className="h-3 w-3 text-blue-400" />
                              <span>
                                Filter by the iframe URL to see only your app&apos;s logs
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Debugging tips:</p>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <ChevronRight className="h-3 w-3 text-yellow-400" />
                              <span>
                                Use{" "}
                                <code className="rounded bg-neutral-700 px-1 py-0.5 font-mono text-[10px]">
                                  console.log()
                                </code>{" "}
                                in your app to trace state changes
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <ChevronRight className="h-3 w-3 text-yellow-400" />
                              <span>
                                Monitor the <strong>Event Log</strong> tab for all postMessage traffic
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <ChevronRight className="h-3 w-3 text-yellow-400" />
                              <span>
                                Check the <strong>Network</strong> tab for API calls if using network
                                permission
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <ChevronRight className="h-3 w-3 text-yellow-400" />
                              <span>
                                Use{" "}
                                <code className="rounded bg-neutral-700 px-1 py-0.5 font-mono text-[10px]">
                                  debugger;
                                </code>{" "}
                                statements in your code for breakpoints
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Log Entry Row Component =====

function LogEntryRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const time = entry.timestamp.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });

  const isError =
    entry.type === "error" ||
    (entry.payload &&
      typeof entry.payload === "object" &&
      "error" in (entry.payload as Record<string, unknown>));

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className={cn(
        "w-full text-left rounded px-2 py-1.5 transition-colors hover:bg-neutral-800/70",
        expanded && "bg-neutral-800/50"
      )}
    >
      <div className="flex items-center gap-2">
        {/* Direction indicator */}
        {entry.direction === "sent" ? (
          <ArrowUpRight
            className={cn(
              "h-3 w-3 shrink-0",
              isError ? "text-red-400" : "text-blue-400"
            )}
          />
        ) : (
          <ArrowDownRight
            className={cn(
              "h-3 w-3 shrink-0",
              isError ? "text-red-400" : "text-green-400"
            )}
          />
        )}

        {/* Timestamp */}
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">{time}</span>

        {/* Direction label */}
        <span
          className={cn(
            "rounded px-1 py-0.5 text-[10px] font-medium shrink-0",
            entry.direction === "sent"
              ? isError
                ? "bg-red-500/10 text-red-400"
                : "bg-blue-500/10 text-blue-400"
              : isError
                ? "bg-red-500/10 text-red-400"
                : "bg-green-500/10 text-green-400"
          )}
        >
          {entry.direction === "sent" ? "SENT" : "RECV"}
        </span>

        {/* Event type */}
        <span className="text-xs font-mono font-medium truncate">{entry.type}</span>

        {/* Expand indicator */}
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform ml-auto",
            expanded && "rotate-90"
          )}
        />
      </div>

      {/* Expanded payload */}
      {expanded && (
        <pre className="mt-1.5 rounded bg-neutral-900 p-2 text-[11px] font-mono text-neutral-300 overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all">
          {JSON.stringify(entry.payload, null, 2)}
        </pre>
      )}
    </button>
  );
}

// ===== Custom Message Sender =====

function CustomMessageSender({
  onSend,
}: {
  onSend: (data: Record<string, unknown>) => void;
}) {
  const [rawMessage, setRawMessage] = useState('{\n  "type": "action",\n  "name": "",\n  "params": {}\n}');
  const [error, setError] = useState("");

  const handleSend = () => {
    setError("");
    try {
      const parsed = JSON.parse(rawMessage.trim());
      if (typeof parsed !== "object" || parsed === null) {
        setError("Message must be a JSON object");
        return;
      }
      onSend(parsed);
      setError("");
    } catch {
      setError("Invalid JSON");
    }
  };

  return (
    <div>
      <Textarea
        value={rawMessage}
        onChange={(e) => {
          setRawMessage(e.target.value);
          setError("");
        }}
        className="bg-neutral-800 border-neutral-700 font-mono text-xs min-h-[80px]"
        rows={4}
      />
      {error && (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      )}
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={handleSend} className="gap-1.5">
          <Send className="h-3 w-3" />
          Send to App
        </Button>
      </div>
    </div>
  );
}
