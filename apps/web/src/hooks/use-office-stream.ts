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

  // Single effect: fetch health first, then connect SSE.
  // Health data is captured in a closure variable so SSE handler always has it.
  useEffect(() => {
    let cancelled = false;
    const healthMap = new Map<string, AgentHealthItem>();

    // 1. Fetch all agents from health endpoint
    api<AgentHealthItem[]>("/api/agents/health", { silent: true })
      .then((healthList) => {
        if (cancelled) return;
        for (const h of healthList) {
          healthMap.set(h.agentId, h);
        }
        // Seed initial agent list
        setAgents(healthList.map(healthToAgent));
      })
      .catch(() => {
        // Health fetch failed — SSE will still work below
      })
      .finally(() => {
        if (cancelled) return;

        // 2. Connect SSE after health data is available
        const es = new EventSource(OFFICE_STREAM_URL, { withCredentials: true });
        esRef.current = es;

        es.onopen = () => setConnected(true);

        es.onmessage = (event) => {
          try {
            const data: OfficeStatusEvent = JSON.parse(event.data);
            if (data.type !== "status_update") return;

            const sseAgents = data.agents.map(toAgent);
            const mergedIds = new Set(sseAgents.map((a) => a.id));
            const merged = [...sseAgents];

            // Append health-only agents not present in SSE
            for (const [id, h] of healthMap) {
              if (!mergedIds.has(id)) {
                merged.push(healthToAgent(h));
                mergedIds.add(id);
              }
            }

            setAgents(merged);
          } catch {
            // Ignore malformed events
          }
        };

        es.onerror = () => setConnected(false);
      });

    return () => {
      cancelled = true;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
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
