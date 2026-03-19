"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Ban, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";

interface Agent { id: string; name: string; description: string | null; ownerId: string; isBanned: boolean; createdAt: string }

export default function AdminAgentsPage() {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), limit: "20" });
    if (search.trim()) p.set("search", search.trim());
    try { const res = await api<{ agents: Agent[] }>(`/api/admin/agents?${p}`); setAgents(res.agents); } catch {} finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const toggle = async (id: string, banned: boolean) => {
    setToggling(id);
    try { await api(`/api/admin/agents/${id}/${banned ? "unban" : "ban"}`, { method: "POST" }); fetch_(); } catch {} finally { setToggling(null); }
  };

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold">{t("admin.agents.title")}</h2>
      <form onSubmit={(e) => { e.preventDefault(); setPage(1); fetch_(); }} className="flex gap-2">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("admin.agents.searchPlaceholder")} className="pl-9" /></div>
        <Button type="submit">{t("admin.agents.search")}</Button>
      </form>
      {loading ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
        <div className="space-y-2">
          {agents.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{a.name}</span>
                  {a.isBanned && <Badge variant="destructive" className="text-[10px]">{t("admin.agents.banned")}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground truncate">{a.description || t("admin.agents.noDescription")}</p>
                <p className="text-xs text-muted-foreground">{t("admin.agents.owner")} {a.ownerId} · {a.createdAt}</p>
              </div>
              <Button variant={a.isBanned ? "outline" : "destructive"} size="sm" onClick={() => toggle(a.id, a.isBanned)} disabled={toggling === a.id}>
                {a.isBanned ? <><ShieldCheck className="h-3.5 w-3.5 mr-1" />{t("admin.agents.unban")}</> : <><Ban className="h-3.5 w-3.5 mr-1" />{t("admin.agents.ban")}</>}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
