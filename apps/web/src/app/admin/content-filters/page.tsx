"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface Rule { id: string; pattern: string; action: string; enabled: boolean; createdAt: string }

export default function AdminContentFiltersPage() {
  const { t } = useTranslation();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPattern, setNewPattern] = useState("");
  const [creating, setCreating] = useState(false);

  const fetch_ = useCallback(async () => {
    try { const res = await api<{ rules: Rule[] }>("/api/admin/content-filters"); setRules(res.rules); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleCreate = async () => {
    if (!newPattern.trim()) return;
    setCreating(true);
    try { await api("/api/admin/content-filters", { method: "POST", body: JSON.stringify({ pattern: newPattern.trim() }) }); setNewPattern(""); fetch_(); } catch {} finally { setCreating(false); }
  };

  const handleDelete = async (id: string) => {
    try { await api(`/api/admin/content-filters/${id}`, { method: "DELETE" }); fetch_(); } catch {}
  };

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold">{t("admin.contentFilters.title")}</h2>
      <div className="flex gap-2">
        <Input value={newPattern} onChange={(e) => setNewPattern(e.target.value)} placeholder={t("admin.contentFilters.placeholder")} className="flex-1" />
        <Button onClick={handleCreate} disabled={creating || !newPattern.trim()}><Plus className="h-4 w-4 mr-1" />{t("admin.contentFilters.add")}</Button>
      </div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : (
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <code className="flex-1 text-sm font-mono break-all">{r.pattern}</code>
              <span className="text-xs text-muted-foreground">{r.action}</span>
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {rules.length === 0 && <p className="text-center text-muted-foreground py-8">{t("admin.contentFilters.noRules")}</p>}
        </div>
      )}
    </div>
  );
}
