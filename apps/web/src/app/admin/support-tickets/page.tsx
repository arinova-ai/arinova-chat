"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";

interface Ticket { id: string; userId: string; userName: string; subject: string; status: string; adminReply: string | null; createdAt: string }

export default function AdminSupportTicketsPage() {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyId, setReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);

  const fetch_ = useCallback(async () => {
    try { const res = await api<{ tickets: Ticket[] }>("/api/admin/support-tickets"); setTickets(res.tickets); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleReply = async (id: string) => {
    if (!replyText.trim()) return;
    setReplying(true);
    try { await api(`/api/admin/support-tickets/${id}/reply`, { method: "POST", body: JSON.stringify({ reply: replyText }) }); setReplyId(null); setReplyText(""); fetch_(); } catch {} finally { setReplying(false); }
  };

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold">{t("admin.supportTickets.title")}</h2>
      {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : (
        <div className="space-y-3">
          {tickets.map((tk) => (
            <div key={tk.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{tk.subject}</span>
                <Badge variant={tk.status === "open" ? "default" : "secondary"} className="text-[10px]">{tk.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{tk.userName} · {tk.createdAt}</p>
              {tk.adminReply && <p className="text-sm bg-muted/50 rounded p-2">{t("admin.supportTickets.replyLabel")} {tk.adminReply}</p>}
              {tk.status === "open" && replyId === tk.id ? (
                <div className="flex gap-2">
                  <Input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder={t("admin.supportTickets.replyPlaceholder")} className="flex-1" />
                  <Button size="sm" onClick={() => handleReply(tk.id)} disabled={replying}><Send className="h-3.5 w-3.5" /></Button>
                </div>
              ) : tk.status === "open" ? (
                <Button variant="outline" size="sm" onClick={() => { setReplyId(tk.id); setReplyText(""); }}>{t("admin.supportTickets.reply")}</Button>
              ) : null}
            </div>
          ))}
          {tickets.length === 0 && <p className="text-center text-muted-foreground py-8">{t("admin.supportTickets.noTickets")}</p>}
        </div>
      )}
    </div>
  );
}
