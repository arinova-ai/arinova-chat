"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Bot, ArrowLeft, Save, Key, RefreshCw, Copy, Trash2, Activity, Brain,
  Shield, Sparkles, AlertTriangle, Eye, EyeOff,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";

interface AgentDetail {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  category: string | null;
  systemPrompt: string | null;
  welcomeMessage: string | null;
  secretToken: string | null;
  notificationsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

type Tab = "general" | "skills" | "token" | "memory" | "activity" | "danger";

const TABS: { id: Tab; label: string; icon: typeof Bot }[] = [
  { id: "general", label: "General", icon: Bot },
  { id: "skills", label: "Skills", icon: Sparkles },
  { id: "token", label: "Token", icon: Key },
  { id: "memory", label: "Memory Capsule", icon: Brain },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

export default function AgentManagePage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("general");
  const [saving, setSaving] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  // Editable fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [category, setCategory] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showToken, setShowToken] = useState(false);

  const fetchAgent = useCallback(async () => {
    try {
      const data = await api<AgentDetail>(`/api/agents/${agentId}`, { silent: true });
      setAgent(data);
      setName(data.name);
      setDescription(data.description ?? "");
      setIsPublic(data.isPublic);
      setCategory(data.category ?? "");
      setSystemPrompt(data.systemPrompt ?? "");
      setWelcomeMessage(data.welcomeMessage ?? "");
      setNotificationsEnabled(data.notificationsEnabled);
    } catch { /* ignore */ }
    setLoading(false);
  }, [agentId]);

  useEffect(() => { fetchAgent(); }, [fetchAgent]);

  const saveGeneral = async () => {
    setSaving(true);
    try {
      await api(`/api/agents/${agentId}`, {
        method: "PUT",
        body: JSON.stringify({ name, description, category: category || null, systemPrompt }),
      });
      addToast("Agent updated");
      fetchAgent();
    } catch { addToast("Failed to save"); }
    setSaving(false);
  };


  const regenerateToken = async () => {
    if (!confirm("Regenerate token? All existing integrations using the current token will stop working.")) return;
    try {
      const data = await api<{ secretToken: string }>(`/api/agents/${agentId}/regenerate-token`, { method: "POST" });
      if (data?.secretToken) {
        setAgent((prev) => prev ? { ...prev, secretToken: data.secretToken } : prev);
        addToast("Token regenerated");
      }
    } catch { addToast("Failed to regenerate token"); }
  };

  const copyToken = () => {
    if (agent?.secretToken) {
      navigator.clipboard.writeText(agent.secretToken);
      addToast("Token copied");
    }
  };

  const deleteAgent = async () => {
    if (!confirm("Are you sure you want to delete this agent? This cannot be undone.")) return;
    try {
      await api(`/api/agents/${agentId}`, { method: "DELETE" });
      addToast("Agent deleted");
      router.push("/agents");
    } catch { addToast("Failed to delete agent"); }
  };

  if (loading || !agent) return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block"><IconRail /></div>
      <div className="flex flex-1 flex-col min-w-0 items-center justify-center text-muted-foreground">
        {loading ? "Loading..." : "Agent not found"}
        <MobileBottomNav />
      </div>
    </div>
  );

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>
      <div className="flex flex-1 flex-col min-w-0">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="p-1 hover:bg-muted rounded">
          <ArrowLeft className="h-4 w-4" />
        </button>
        {agent.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={agent.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            <Bot className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <h1 className="text-base font-semibold flex-1 truncate">{agent.name}</h1>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b border-border overflow-x-auto">
        <div className="flex px-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2",
                tab === t.id ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] md:pb-4 space-y-4">
        {tab === "general" && (
          <>
            <div>
              <label className="text-sm font-medium">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm resize-none" />
            </div>
            <div>
              <label className="text-sm font-medium">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm">
                <option value="">None</option>
                <option value="assistant">Assistant</option>
                <option value="creative">Creative</option>
                <option value="productivity">Productivity</option>
                <option value="education">Education</option>
                <option value="entertainment">Entertainment</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">System Prompt</label>
              <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={6} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm font-mono resize-none" placeholder="You are a helpful AI assistant..." />
              <p className="mt-1 text-xs text-muted-foreground">Instructions that define how this agent behaves in conversations.</p>
            </div>
            <Button onClick={saveGeneral} disabled={saving} size="sm">
              <Save className="h-3.5 w-3.5 mr-1" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </>
        )}

        {tab === "skills" && (
          <div className="text-sm text-muted-foreground">
            <p>Manage installed skills from the <button type="button" onClick={() => router.push("/skills")} className="text-blue-400 hover:underline">Skills page</button>.</p>
          </div>
        )}

        {/* Permissions tab removed — public/private concept removed */}

        {tab === "token" && (
          <>
            <div>
              <label className="text-sm font-medium">Bot Token</label>
              <div className="mt-1 flex gap-2">
                <input
                  value={showToken ? (agent.secretToken ?? "") : "ari_••••••••••••••••"}
                  readOnly
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm font-mono"
                />
                <Button variant="outline" size="sm" onClick={() => setShowToken((v) => !v)} title={showToken ? "Hide" : "Reveal"}>
                  {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
                <Button variant="outline" size="sm" onClick={copyToken}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Use this token to authenticate API requests for this agent.</p>
            </div>
            <Button variant="outline" size="sm" onClick={regenerateToken}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Regenerate Token
            </Button>
          </>
        )}

        {tab === "memory" && (
          <MemoryCapsuleTab agentId={agentId} />
        )}

        {tab === "activity" && (
          <AgentActivityTab agentId={agentId} />
        )}

        {tab === "danger" && (
          <div className="rounded-lg border border-red-500/30 p-4 space-y-3">
            <h3 className="text-sm font-medium text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Danger Zone
            </h3>
            <p className="text-xs text-muted-foreground">
              Deleting this agent is permanent. All conversations, memories, and configurations will be lost.
            </p>
            <Button variant="destructive" size="sm" onClick={deleteAgent}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete Agent
            </Button>
          </div>
        )}
      </div>

      <MobileBottomNav />
      </div>
    </div>
  );
}

// ── Memory Capsule Tab ──────────────────────────────────────────────────

interface Capsule {
  id: string;
  title: string;
  status: string;
  entryCount: number;
  createdAt: string;
}

interface CapsuleGrant {
  capsuleId: string;
  agentId: string;
}

function MemoryCapsuleTab({ agentId }: { agentId: string }) {
  const [capsules, setCapsules] = useState<Capsule[]>([]);
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    (async () => {
      try {
        const [capRes, grantRes] = await Promise.allSettled([
          api<Capsule[]>("/api/memory/capsules", { silent: true }),
          api<{ grants: CapsuleGrant[] }>(`/api/memory/capsules/grants?agent_id=${agentId}`, { silent: true }),
        ]);
        if (capRes.status === "fulfilled") setCapsules(capRes.value ?? []);
        if (grantRes.status === "fulfilled") {
          setGrants(new Set((grantRes.value?.grants ?? []).map((g) => g.capsuleId)));
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [agentId]);

  const toggleGrant = async (capsuleId: string) => {
    const hasGrant = grants.has(capsuleId);
    try {
      if (hasGrant) {
        await api(`/api/memory/capsules/${capsuleId}/grants/${agentId}`, { method: "DELETE" });
        setGrants((prev) => { const next = new Set(prev); next.delete(capsuleId); return next; });
      } else {
        await api(`/api/memory/capsules/${capsuleId}/grants`, {
          method: "POST",
          body: JSON.stringify({ agentId }),
        });
        setGrants((prev) => new Set(prev).add(capsuleId));
      }
    } catch { addToast("Failed to update access"); }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading capsules...</p>;
  if (capsules.length === 0) return <p className="text-sm text-muted-foreground">No memory capsules yet. Create one from a conversation.</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-3">Toggle which memory capsules this agent can access.</p>
      {capsules.map((c) => (
        <div key={c.id} className="flex items-center gap-3 rounded-lg border p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{c.title || "Untitled Capsule"}</p>
            <p className="text-xs text-muted-foreground">{c.entryCount} entries</p>
          </div>
          <button
            type="button"
            onClick={() => toggleGrant(c.id)}
            className={cn(
              "relative h-6 w-11 rounded-full transition-colors",
              grants.has(c.id) ? "bg-blue-600" : "bg-muted",
            )}
          >
            <span className={cn(
              "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform",
              grants.has(c.id) && "translate-x-5",
            )} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Agent Activity Tab ──────────────────────────────────────────────────

interface ActivityItem {
  id: string;
  activityType: string;
  title: string;
  detail: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

function AgentActivityTab({ agentId }: { agentId: string }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api<{ items: ActivityItem[] }>(
          `/api/office/activity?agentId=${agentId}&limit=50`,
          { silent: true },
        );
        setItems(data?.items ?? []);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [agentId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading activity...</p>;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No activity recorded for this agent yet.</p>;

  return (
    <div className="space-y-1">
      {items.map((item) => {
        const isCompleted = item.activityType === "task_completed";
        const durationMs = (item.metadata as Record<string, unknown>)?.durationMs as number | undefined;
        const costUsd = (item.metadata as Record<string, unknown>)?.costUsd as number | undefined;
        return (
          <div key={item.id} className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/30 transition-colors">
            <span className="text-base shrink-0 mt-0.5">{isCompleted ? "\u2705" : "\u23F3"}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">{item.title}</p>
              {item.detail && <p className="text-xs text-muted-foreground">{item.detail}</p>}
              <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground/60">
                {durationMs != null && <span>{Math.round(durationMs / 1000)}s</span>}
                {costUsd != null && <span>${costUsd.toFixed(4)}</span>}
                <span>{new Date(item.createdAt).toLocaleString()}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
