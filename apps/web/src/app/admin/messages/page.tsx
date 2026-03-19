"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface Msg { id: string; conversationId: string; content: string; senderName: string; senderUserId: string; createdAt: string }
interface MsgsRes { messages: Msg[]; total: number; page: number; limit: number }

export default function AdminMessagesPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<MsgsRes | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), limit: "20" });
    if (search.trim()) p.set("q", search.trim());
    try { setData(await api<MsgsRes>(`/api/admin/messages?${p}`)); } catch {} finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try { await api(`/api/admin/messages/${id}`, { method: "DELETE" }); fetch_(); } catch {} finally { setDeleting(null); }
  };

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold">{t("admin.messages.title")}</h2>
      <form onSubmit={(e) => { e.preventDefault(); setPage(1); fetch_(); }} className="flex gap-2">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("admin.messages.searchPlaceholder")} className="pl-9" /></div>
        <Button type="submit">{t("admin.messages.search")}</Button>
      </form>
      {loading ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
        <div className="space-y-2">
          {data?.messages.map((m) => (
            <div key={m.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{m.senderName} · {m.createdAt}</p>
                <p className="text-sm mt-1 break-words">{m.content.slice(0, 300)}{m.content.length > 300 ? "..." : ""}</p>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0 text-destructive" onClick={() => handleDelete(m.id)} disabled={deleting === m.id}>
                {deleting === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </div>
          ))}
          {data?.messages.length === 0 && <p className="text-center text-muted-foreground py-8">{t("admin.messages.noMessages")}</p>}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm py-1">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
