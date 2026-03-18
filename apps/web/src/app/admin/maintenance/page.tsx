"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Wrench } from "lucide-react";

export default function AdminMaintenancePage() {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ enabled: boolean; message?: string }>("/api/admin/maintenance")
      .then((d) => { setEnabled(d.enabled); setMessage(d.message ?? ""); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try { await api("/api/admin/maintenance", { method: "POST", body: JSON.stringify({ enabled, message: message || null }) }); } catch {} finally { setSaving(false); }
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="p-6 space-y-6 max-w-lg">
      <h2 className="text-xl font-bold">Maintenance Mode</h2>
      <div className="flex items-center gap-3">
        <Switch checked={enabled} onCheckedChange={setEnabled} />
        <span className="text-sm font-medium">{enabled ? "Maintenance ON" : "Maintenance OFF"}</span>
        {enabled && <Wrench className="h-4 w-4 text-yellow-500" />}
      </div>
      <div>
        <label className="text-sm font-medium">Message (shown to users)</label>
        <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="System is under maintenance..." className="mt-1" />
      </div>
      <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
    </div>
  );
}
