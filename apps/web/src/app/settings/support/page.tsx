"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, Loader2, MessageSquare, CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthGuard } from "@/components/auth-guard";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { useToastStore } from "@/store/toast-store";

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: string;
  adminReply: string | null;
  createdAt: string;
}

const STATUS_ICON: Record<string, typeof CheckCircle> = {
  open: Clock,
  in_progress: Loader2,
  resolved: CheckCircle,
  closed: CheckCircle,
};

const STATUS_COLOR: Record<string, string> = {
  open: "text-yellow-400",
  in_progress: "text-blue-400",
  resolved: "text-green-400",
  closed: "text-muted-foreground",
};

function SupportContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadTickets = useCallback(async () => {
    try {
      const data = await api<Ticket[]>("/api/support/tickets");
      setTickets(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const handleSubmit = async () => {
    if (!subject.trim() || !description.trim()) return;
    setSubmitting(true);
    try {
      await api("/api/support/tickets", {
        method: "POST",
        body: JSON.stringify({ subject: subject.trim(), description: description.trim() }),
      });
      useToastStore.getState().addToast(t("support.submitted"), "success");
      setSubject("");
      setDescription("");
      loadTickets();
    } catch {}
    setSubmitting(false);
  };

  return (
    <div className="flex h-full flex-col bg-background pt-[env(safe-area-inset-top)]">
      <header className="flex items-center gap-3 border-b px-4 py-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">{t("support.title")}</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 max-w-2xl mx-auto w-full">
        {/* Submit form */}
        <div className="space-y-3 rounded-xl border p-4">
          <h2 className="text-sm font-semibold">{t("support.newTicket")}</h2>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("support.subjectPlaceholder")}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("support.descriptionPlaceholder")}
            rows={4}
            className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button onClick={handleSubmit} disabled={submitting || !subject.trim() || !description.trim()} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t("support.submit")}
          </Button>
        </div>

        {/* Ticket list */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{t("support.myTickets")} ({tickets.length})</h2>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : tickets.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("support.noTickets")}</p>
          ) : (
            tickets.map((t) => {
              const Icon = STATUS_ICON[t.status] || MessageSquare;
              return (
                <div key={t.id} className="rounded-lg border p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${STATUS_COLOR[t.status] || ""}`} />
                    <span className="text-sm font-medium flex-1 truncate">{t.subject}</span>
                    <span className="text-[10px] text-muted-foreground">{t.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                  {t.adminReply && (
                    <div className="rounded-md bg-brand/10 px-3 py-2 text-xs">
                      <span className="font-medium">Admin: </span>{t.adminReply}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function SupportPage() {
  return <AuthGuard><SupportContent /></AuthGuard>;
}
