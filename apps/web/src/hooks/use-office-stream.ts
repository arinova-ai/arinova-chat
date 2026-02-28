"use client";

import { useEffect, useRef, useState } from "react";
import { OFFICE_STREAM_URL } from "@/lib/office-config";
import type { Agent } from "@/components/office/types";
import { useChatStore } from "@/store/chat-store";

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

/** Default display properties for agents without rich metadata */
const DEFAULT_EMOJI = "🤖";
const DEFAULT_COLOR = "#64748b";

/** Map plugin AgentState to the UI Agent type */
function toAgent(raw: OfficeStatusEvent["agents"][number]): Agent {
  return {
    id: raw.agentId,
    name: raw.name,
    role: "",
    emoji: DEFAULT_EMOJI,
    color: DEFAULT_COLOR,
    status: raw.status,
    collaboratingWith: raw.collaboratingWith.length > 0 ? raw.collaboratingWith : undefined,
    currentTask: raw.currentTask
      ? { title: raw.currentTask, priority: "", due: "", assignedBy: "", progress: 0, subtasks: [] }
      : undefined,
    recentActivity: [],
    model: raw.model ?? undefined,
    tokenUsage: raw.tokenUsage ?? undefined,
    sessionDurationMs: raw.sessionDurationMs ?? undefined,
    currentToolDetail: raw.currentToolDetail ?? undefined,
  };
}

export function useOfficeStream() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

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
          setAgents(data.agents.map(toAgent));
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
