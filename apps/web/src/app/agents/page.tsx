"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bot, Plus, Trash2, MessageSquare, Settings2, User } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";

interface AgentItem {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  category: string | null;
  createdAt: string;
  source: "agent" | "listing";
}

interface ListingItem {
  id: string;
  agentName: string;
  description: string | null;
  avatarUrl: string | null;
  category: string | null;
  status: string;
  createdAt: string;
}

export default function AgentsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const addToast = useToastStore((s) => s.addToast);

  const fetchAgents = useCallback(async () => {
    const [agentsRes, listingsRes] = await Promise.allSettled([
      api<AgentItem[]>("/api/agents", { silent: true }),
      api<{ listings: ListingItem[] }>("/api/agent-hub/manage", { silent: true }),
    ]);

    const items: AgentItem[] = [];
    const seenIds = new Set<string>();

    // Agents from /api/agents
    if (agentsRes.status === "fulfilled" && agentsRes.value) {
      for (const a of agentsRes.value) {
        items.push({ ...a, source: "agent" });
        seenIds.add(a.id);
      }
    }

    // Listings from /api/agent-hub/manage (creator console agents)
    if (listingsRes.status === "fulfilled" && listingsRes.value?.listings) {
      for (const l of listingsRes.value.listings) {
        if (seenIds.has(l.id)) continue;
        items.push({
          id: l.id,
          name: l.agentName,
          description: l.description,
          avatarUrl: l.avatarUrl,
          isPublic: l.status === "active",
          category: l.category,
          createdAt: l.createdAt,
          source: "listing",
        });
      }
    }

    setAgents(items);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (!confirm(`Delete ${selected.size} agent(s)? This cannot be undone.`)) return;
    const results = await Promise.allSettled(
      [...selected].map((id) => {
        const agent = agents.find((a) => a.id === id);
        const endpoint = agent?.source === "listing" ? `/api/agent-hub/agents/${id}` : `/api/agents/${id}`;
        return api(endpoint, { method: "DELETE" });
      }),
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    setSelected(new Set());
    addToast(`Deleted ${succeeded}/${results.length} agent(s)`);
    fetchAgents();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3 flex items-center gap-3">
        <Bot className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-base font-semibold flex-1">{t("nav.agents")}</h1>
        {selected.size > 0 && (
          <Button variant="destructive" size="sm" onClick={deleteSelected}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete ({selected.size})
          </Button>
        )}
        <Button size="sm" onClick={() => router.push("/creator/new")}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Create Agent
        </Button>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading...</div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/15">
              <Bot className="h-7 w-7 text-blue-400" />
            </div>
            <p className="text-sm text-muted-foreground">No agents yet</p>
            <Button size="sm" onClick={() => router.push("/creator/new")}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Create your first agent
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30",
                  selected.has(agent.id) && "border-blue-500 bg-blue-500/5",
                )}
              >
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={() => toggleSelect(agent.id)}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                    selected.has(agent.id) ? "border-blue-500 bg-blue-500 text-white" : "border-muted-foreground/30",
                  )}
                >
                  {selected.has(agent.id) && <span className="text-xs">&#10003;</span>}
                </button>

                {/* Avatar */}
                {agent.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={agent.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted shrink-0">
                    <Bot className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{agent.name}</p>
                  {agent.description && (
                    <p className="text-xs text-muted-foreground truncate">{agent.description}</p>
                  )}
                </div>

                {/* Status badge */}
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full shrink-0",
                  agent.isPublic ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground",
                )}>
                  {agent.isPublic ? "Public" : "Private"}
                </span>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (agent.source === "listing") router.push(`/agent-hub/chat/${agent.id}`);
                      else router.push(`/agent/${agent.id}`);
                    }}
                    className="p-1.5 rounded-md hover:bg-muted transition-colors"
                    title="Chat"
                  >
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (agent.source === "listing") router.push(`/creator/${agent.id}/edit`);
                      else router.push(`/agents/${agent.id}`);
                    }}
                    className="p-1.5 rounded-md hover:bg-muted transition-colors"
                    title="Manage"
                  >
                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/agent-hub/${agent.id}`)}
                    className="p-1.5 rounded-md hover:bg-muted transition-colors"
                    title="Profile"
                  >
                    <User className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
