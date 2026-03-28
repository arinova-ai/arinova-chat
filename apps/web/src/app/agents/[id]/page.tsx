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

type Tab = "general" | "prompt" | "skills" | "permissions" | "token" | "memory" | "activity" | "danger";

const TABS: { id: Tab; label: string; icon: typeof Bot }[] = [
  { id: "general", label: "General", icon: Bot },
  { id: "prompt", label: "System Prompt", icon: Brain },
  { id: "skills", label: "Skills", icon: Sparkles },
  { id: "permissions", label: "Permissions", icon: Shield },
  { id: "token", label: "Token", icon: Key },
  { id: "memory", label: "Memory", icon: Brain },
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
        body: JSON.stringify({ name, description, isPublic, category: category || null }),
      });
      addToast("Agent updated");
      fetchAgent();
    } catch { addToast("Failed to save"); }
    setSaving(false);
  };

  const savePrompt = async () => {
    setSaving(true);
    try {
      await api(`/api/agents/${agentId}`, {
        method: "PUT",
        body: JSON.stringify({ systemPrompt, welcomeMessage }),
      });
      addToast("System prompt updated");
    } catch { addToast("Failed to save"); }
    setSaving(false);
  };

  const savePermissions = async () => {
    setSaving(true);
    try {
      await api(`/api/agents/${agentId}`, {
        method: "PUT",
        body: JSON.stringify({ notificationsEnabled, isPublic }),
      });
      addToast("Permissions updated");
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

  if (loading) return <div className="flex h-full items-center justify-center text-muted-foreground">Loading...</div>;
  if (!agent) return <div className="flex h-full items-center justify-center text-muted-foreground">Agent not found</div>;

  return (
    <div className="flex h-full flex-col pt-[env(safe-area-inset-top,0px)]">
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
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm resize-none" />
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
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isPublic" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="rounded" />
              <label htmlFor="isPublic" className="text-sm">Public (visible to other users)</label>
            </div>
            <Button onClick={saveGeneral} disabled={saving} size="sm">
              <Save className="h-3.5 w-3.5 mr-1" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </>
        )}

        {tab === "prompt" && (
          <>
            <div>
              <label className="text-sm font-medium">System Prompt</label>
              <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={12} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm font-mono resize-none" placeholder="You are a helpful AI assistant..." />
            </div>
            <div>
              <label className="text-sm font-medium">Welcome Message</label>
              <textarea value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} rows={3} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm resize-none" placeholder="First message sent when a user starts a conversation" />
            </div>
            <Button onClick={savePrompt} disabled={saving} size="sm">
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

        {tab === "permissions" && (
          <>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="notifications" checked={notificationsEnabled} onChange={(e) => setNotificationsEnabled(e.target.checked)} className="rounded" />
              <label htmlFor="notifications" className="text-sm">Enable notifications</label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="public2" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="rounded" />
              <label htmlFor="public2" className="text-sm">Public (visible in agent hub)</label>
            </div>
            <Button onClick={savePermissions} disabled={saving} size="sm">
              <Save className="h-3.5 w-3.5 mr-1" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </>
        )}

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
          <div className="text-sm text-muted-foreground">
            <p>Agent memories are managed automatically during conversations. View memories in the <button type="button" onClick={() => router.push(`/agent/${agentId}`)} className="text-blue-400 hover:underline">agent chat</button>.</p>
          </div>
        )}

        {tab === "activity" && (
          <div className="text-sm text-muted-foreground">
            <p>View task activity in the <button type="button" onClick={() => router.push("/office/activity")} className="text-blue-400 hover:underline">Office Activity tab</button>.</p>
          </div>
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
    </div>
  );
}
