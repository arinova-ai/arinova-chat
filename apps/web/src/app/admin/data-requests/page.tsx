"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle } from "lucide-react";

interface DataReq { id: string; userId: string; userName: string; type: string; createdAt: string }

export default function AdminDataRequestsPage() {
  const [requests, setRequests] = useState<DataReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    try { const res = await api<{ requests: DataReq[] }>("/api/admin/data-requests"); setRequests(res.requests); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleApprove = async (id: string) => {
    setApproving(id);
    try { await api(`/api/admin/data-requests/${id}/approve`, { method: "POST" }); fetch_(); } catch {} finally { setApproving(null); }
  };

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold">GDPR Data Requests</h2>
      <p className="text-sm text-muted-foreground">Pending data export and deletion requests.</p>
      {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{r.userName}</p>
                <p className="text-xs text-muted-foreground">Type: {r.type} · {r.createdAt}</p>
              </div>
              <Button size="sm" onClick={() => handleApprove(r.id)} disabled={approving === r.id}>
                {approving === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><CheckCircle className="h-3.5 w-3.5 mr-1" />Approve</>}
              </Button>
            </div>
          ))}
          {requests.length === 0 && <p className="text-center text-muted-foreground py-8">No pending requests</p>}
        </div>
      )}
    </div>
  );
}
