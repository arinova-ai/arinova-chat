"use client";

import { useEffect, useRef, useState } from "react";
import { OFFICE_STREAM_URL } from "@/lib/office-config";
import type { Agent } from "@/components/office/types";
import { useChatStore } from "@/store/chat-store";
import { api } from "@/lib/api";

/** Shape of the SSE status event from the office plugin */
interface OfficeStatusEvent {
  type: "status_update";
  agents: {
    agentId: string;
    name: string;
    status: "working" | "idle" | "blocked" | "collaborating";
    lastActivity: number;
    collaboratingWith: string[];
    currentTask: string | null;
    online: boolean;
    model?: string;
    tokenUsage?: { input: number; output: number; cacheRead?: number; cacheWrite?: number; total?: number };
    sessionDurationMs?: number;
    currentToolDetail?: string;
  }[];
  timestamp: number;
}

/** Shape of GET /api/agents/health response item */
interface AgentHealthItem {
  agentId: string;
  agentName: string;
  status: string;
  wsConnected: boolean;
  a2aReachable: boolean | null;
  latencyMs: number | null;
  checkedAt: string;
}

/** Default display properties for agents without rich metadata */
const DEFAULT_EMOJI = "🤖";
const DEFAULT_COLOR = "#64748b";

/** Detect UUID-style names that should be replaced with a friendly fallback */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Map plugin AgentState to the UI Agent type */
function toAgent(raw: OfficeStatusEvent["agents"][number]): Agent {
  const name = UUID_RE.test(raw.name) ? "Agent" : raw.name;

  // Build recentActivity from available state instead of leaving it empty
  const recentActivity: { time: string; text: string }[] = [];
  if (raw.currentToolDetail) {
    recentActivity.push({ time: "now", text: raw.currentToolDetail });
  }
  if (raw.currentTask && raw.currentTask !== raw.currentToolDetail?.split(" (")[0]) {
    recentActivity.push({ time: "", text: `Task: ${raw.currentTask}` });
  }

  return {
    id: raw.agentId,
    name,
    role: "",
    emoji: DEFAULT_EMOJI,
    color: DEFAULT_COLOR,
    status: raw.status,
    online: raw.online,
    collaboratingWith: raw.collaboratingWith.length > 0 ? raw.collaboratingWith : undefined,
    currentTask: raw.currentTask
      ? { title: raw.currentTask, priority: "", due: "", assignedBy: "", progress: 0, subtasks: [] }
      : undefined,
    recentActivity,
    model: raw.model ?? undefined,
    tokenUsage: raw.tokenUsage ?? undefined,
    sessionDurationMs: raw.sessionDurationMs ?? undefined,
    currentToolDetail: raw.currentToolDetail ?? undefined,
  };
}

/** Convert a health-check agent into an idle/not-connected Agent */
function healthToAgent(h: AgentHealthItem): Agent {
  const name = UUID_RE.test(h.agentName) ? "Agent" : h.agentName;
  return {
    id: h.agentId,
    name,
    role: "",
    emoji: DEFAULT_EMOJI,
    color: DEFAULT_COLOR,
    status: "idle",
    online: h.wsConnected,
    recentActivity: [],
  };
}

export function useOfficeStream() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const healthAgentsRef = useRef<Map<string, AgentHealthItem>>(new Map());

  // On mount: fetch all agents via health endpoint to seed initial state
  useEffect(() => {
    let cancelled = false;

    async function fetchInitialAgents() {
      try {
        const healthList = await api<AgentHealthItem[]>("/api/agents/health", { silent: true });
        if (cancelled) return;

        // Store health data for SSE merging
        for (const h of healthList) {
          healthAgentsRef.current.set(h.agentId, h);
        }

        // Seed agents as idle, or merge with SSE agents if they arrived first
        setAgents((prev) => {
          if (prev.length === 0) return healthList.map(healthToAgent);
          // SSE arrived first — merge health agents not yet present
          const existingIds = new Set(prev.map((a) => a.id));
          const merged = [...prev];
          for (const h of healthList) {
            if (!existingIds.has(h.agentId)) {
              merged.push(healthToAgent(h));
            }
          }
          return merged;
        });
      } catch (e) {
        console.warn("[useOfficeStream] Failed to fetch initial agents:", e);
      }
    }

    fetchInitialAgents();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const url = OFFICE_STREAM_URL;
    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const data: OfficeStatusEvent = JSON.parse(event.data);
        if (data.type === "status_update") {
          const sseAgents = data.agents.map(toAgent);
          const sseIds = new Set(sseAgents.map((a) => a.id));

          setAgents((prev) => {
            const merged = [...sseAgents];
            const mergedIds = new Set(sseIds);

            // Keep existing non-SSE agents
            for (const existing of prev) {
              if (!mergedIds.has(existing.id)) {
                merged.push({ ...existing, status: "idle" as const, online: false });
                mergedIds.add(existing.id);
              }
            }

            // Include health-seeded agents not yet in the list
            for (const [id, h] of healthAgentsRef.current) {
              if (!mergedIds.has(id)) {
                merged.push(healthToAgent(h));
              }
            }

            return merged;
          });
        }
      } catch {
        // Ignore malformed events
      }
    };

    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  // Monitor chat-store thinkingAgents: when an agent stops streaming
  // (removed from thinkingAgents), proactively set it to idle in the
  // office view instead of waiting for the 60s SSE server-side timeout.
  const prevThinkingIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsub = useChatStore.subscribe((state) => {
      const { thinkingAgents } = state;

      // Collect all currently-thinking agent IDs
      const currentIds = new Set<string>();
      for (const entries of Object.values(thinkingAgents)) {
        for (const entry of entries) {
          currentIds.add(entry.agentId);
        }
      }

      // Find agents that were thinking but are no longer
      const stoppedIds: string[] = [];
      for (const id of prevThinkingIdsRef.current) {
        if (!currentIds.has(id)) {
          stoppedIds.push(id);
        }
      }
      prevThinkingIdsRef.current = currentIds;

      // Set stopped agents to idle immediately
      if (stoppedIds.length > 0) {
        setAgents((prev) =>
          prev.map((a) =>
            stoppedIds.includes(a.id) && a.status === "working"
              ? { ...a, status: "idle" as const }
              : a
          )
        );
      }
    });
    return unsub;
  }, []);

  return { agents, connected };
}
