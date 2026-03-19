"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Send, CheckCircle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface BroadcastResult {
  success: boolean;
  totalUsers: number;
  sent: number;
}

export default function AdminBroadcastPage() {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await api<BroadcastResult>("/api/admin/broadcast", {
        method: "POST",
        body: JSON.stringify({ content: content.trim() }),
      });
      setResult(res);
      setContent("");
    } catch {
      // api() auto-toasts
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="mb-6 text-xl font-bold text-foreground">
        {t("admin.broadcast.title")}
      </h2>

      {/* Success result */}
      {result && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
          <CheckCircle className="h-5 w-5 shrink-0 text-green-400" />
          <p className="text-sm text-green-300">
            {t("admin.broadcast.sentResult", { sent: result.sent, total: result.totalUsers })}
          </p>
          <button
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setResult(null)}
          >
            {t("admin.broadcast.dismiss")}
          </button>
        </div>
      )}

      <div className="mx-auto max-w-2xl space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("admin.broadcast.description")}
        </p>

        <Textarea
          placeholder={t("admin.broadcast.placeholder")}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          className="resize-none"
        />

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {content.trim().length} {t("admin.broadcast.characters")}
          </span>
          <Button
            disabled={!content.trim()}
            onClick={() => setConfirmOpen(true)}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {t("admin.broadcast.sendBroadcast")}
          </Button>
        </div>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.broadcast.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("admin.broadcast.confirmDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg bg-accent p-3 text-sm text-foreground whitespace-pre-wrap">
            {content.trim()}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={sending}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSend} disabled={sending} className="gap-2">
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending ? t("admin.broadcast.sending") : t("admin.broadcast.confirmSend")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
