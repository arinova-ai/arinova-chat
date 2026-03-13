"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, XCircle, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface VerificationRequest {
  id: string;
  communityId: string;
  requesterId: string;
  businessName: string | null;
  businessRegistration: string | null;
  documentsUrl: string | null;
  status: string;
  reviewerNotes: string | null;
  communityName: string;
  createdAt: string;
  reviewedAt: string | null;
}

export default function AdminVerificationPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ requests: VerificationRequest[] }>("/api/admin/verification-requests");
      setRequests(data.requests);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleReview = async (id: string, status: "approved" | "rejected") => {
    try {
      await api(`/api/admin/verification-requests/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status, reviewerNotes: reviewNotes[id] || null }),
      });
      fetchRequests();
    } catch {}
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">{t("admin.verification.title")}</h1>
        <Button variant="ghost" size="icon" className="ml-auto" onClick={fetchRequests} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-4 space-y-3">
        {requests.length === 0 && !loading && (
          <p className="py-12 text-center text-sm text-muted-foreground">{t("admin.verification.empty")}</p>
        )}

        {requests.map((req) => (
          <div key={req.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold">{req.communityName}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(req.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                req.status === "pending" && "bg-yellow-500/15 text-yellow-500",
                req.status === "approved" && "bg-green-500/15 text-green-500",
                req.status === "rejected" && "bg-red-500/15 text-red-500",
              )}>
                {req.status}
              </span>
            </div>

            {req.businessName && (
              <p className="text-xs"><span className="text-muted-foreground">Business:</span> {req.businessName}</p>
            )}
            {req.businessRegistration && (
              <p className="text-xs"><span className="text-muted-foreground">Registration:</span> {req.businessRegistration}</p>
            )}
            {req.documentsUrl && (
              <a href={req.documentsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
                <ExternalLink className="h-3 w-3" /> Documents
              </a>
            )}

            {req.status === "pending" && (
              <div className="space-y-2 pt-1">
                <textarea
                  value={reviewNotes[req.id] ?? ""}
                  onChange={(e) => setReviewNotes((n) => ({ ...n, [req.id]: e.target.value }))}
                  placeholder="Review notes (optional)"
                  rows={2}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-ring resize-none"
                />
                <div className="flex gap-2">
                  <Button size="sm" className="gap-1" onClick={() => handleReview(req.id, "approved")}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button size="sm" variant="destructive" className="gap-1" onClick={() => handleReview(req.id, "rejected")}>
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              </div>
            )}

            {req.reviewerNotes && req.status !== "pending" && (
              <p className="text-xs text-muted-foreground italic">Notes: {req.reviewerNotes}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
