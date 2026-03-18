"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus } from "lucide-react";

interface Flag { id: string; name: string; enabled: boolean; description: string | null; updatedAt: string }

export default function AdminFeatureFlagsPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const fetch_ = useCallback(async () => {
    try { const res = await api<{ flags: Flag[] }>("/api/admin/feature-flags"); setFlags(res.flags); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleToggle = async (name: string, enabled: boolean) => {
    try { await api("/api/admin/feature-flags", { method: "POST", body: JSON.stringify({ name, enabled }) }); fetch_(); } catch {}
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try { await api("/api/admin/feature-flags", { method: "POST", body: JSON.stringify({ name: newName.trim(), enabled: false, description: newDesc.trim() || null }) }); setNewName(""); setNewDesc(""); fetch_(); } catch {}
  };

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold">Feature Flags</h2>
      <div className="flex gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Flag name" className="flex-1" />
        <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" className="flex-1" />
        <Button onClick={handleCreate} disabled={!newName.trim()}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : (
        <div className="space-y-2">
          {flags.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium font-mono">{f.name}</p>
                {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
              </div>
              <Switch checked={f.enabled} onCheckedChange={(v) => handleToggle(f.name, v)} />
            </div>
          ))}
          {flags.length === 0 && <p className="text-center text-muted-foreground py-8">No feature flags</p>}
        </div>
      )}
    </div>
  );
}
