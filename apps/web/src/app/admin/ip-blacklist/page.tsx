"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface Entry { id: string; ip: string; reason: string | null; createdAt: string }

export default function AdminIpBlacklistPage() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [creating, setCreating] = useState(false);

  const fetch_ = useCallback(async () => {
    try { const res = await api<{ entries: Entry[] }>("/api/admin/ip-blacklist"); setEntries(res.entries); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleAdd = async () => {
    if (!ip.trim()) return;
    setCreating(true);
    try { await api("/api/admin/ip-blacklist", { method: "POST", body: JSON.stringify({ ip: ip.trim(), reason: reason.trim() || null }) }); setIp(""); setReason(""); fetch_(); } catch {} finally { setCreating(false); }
  };

  const handleDelete = async (id: string) => {
    try { await api(`/api/admin/ip-blacklist/${id}`, { method: "DELETE" }); fetch_(); } catch {}
  };

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold">{t("admin.ipBlacklist.title")}</h2>
      <div className="flex gap-2">
        <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder={t("admin.ipBlacklist.ipPlaceholder")} className="w-48" />
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("admin.ipBlacklist.reasonPlaceholder")} className="flex-1" />
        <Button onClick={handleAdd} disabled={creating || !ip.trim()}><Plus className="h-4 w-4 mr-1" />{t("admin.ipBlacklist.add")}</Button>
      </div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : (
        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <code className="text-sm font-mono font-medium">{e.ip}</code>
              <span className="flex-1 text-xs text-muted-foreground truncate">{e.reason ?? "—"}</span>
              <span className="text-xs text-muted-foreground shrink-0">{e.createdAt}</span>
              <Button variant="ghost" size="icon" className="text-destructive shrink-0" onClick={() => handleDelete(e.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {entries.length === 0 && <p className="text-center text-muted-foreground py-8">{t("admin.ipBlacklist.noEntries")}</p>}
        </div>
      )}
    </div>
  );
}
