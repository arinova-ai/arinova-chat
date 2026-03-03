"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Bot } from "lucide-react";
import { VerifiedBadge } from "@/components/ui/verified-badge";

interface Report {
  id: string;
  messageId: string;
  reporterUserId: string;
  reason: string;
  description: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  messageContent: string;
  reporterName: string | null;
  reporterUsername: string | null;
  senderUserId: string | null;
  senderAgentId: string | null;
  senderName: string | null;
  senderUsername: string | null;
  senderImage: string | null;
  senderIsVerified: boolean;
  senderAgentName: string | null;
}

interface ReportsResponse {
  reports: Report[];
  total: number;
}

function UserLink({ userId, name, username, isVerified }: { userId: string; name: string | null; username: string | null; isVerified?: boolean }) {
  const display = username ? `@${username}` : name ?? userId;
  const secondary = username && name ? ` (${name})` : "";
  return (
    <Link href={`/profile/${userId}`} className="inline-flex items-center gap-0.5 text-blue-400 hover:underline">
      {display}{secondary}
      {isVerified && <VerifiedBadge className="h-3 w-3 text-blue-500" />}
    </Link>
  );
}

function SenderDisplay({ report }: { report: Report }) {
  if (report.senderAgentId && report.senderAgentName) {
    return (
      <span className="inline-flex items-center gap-1 text-sm">
        <Bot className="h-3.5 w-3.5 text-muted-foreground" />
        {report.senderAgentName}
        <Badge variant="outline" className="text-[10px] px-1 py-0">Agent</Badge>
      </span>
    );
  }
  if (report.senderUserId) {
    return (
      <UserLink
        userId={report.senderUserId}
        name={report.senderName}
        username={report.senderUsername}
        isVerified={report.senderIsVerified}
      />
    );
  }
  return <span className="text-sm text-muted-foreground">Unknown</span>;
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Report | null>(null);
  const [notes, setNotes] = useState("");
  const [updating, setUpdating] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<ReportsResponse>(`/api/admin/reports?status=${statusFilter}&page=${page}&limit=20`);
      setReports(data.reports ?? []);
      setTotal(data.total ?? 0);
    } catch {}
    setLoading(false);
  }, [statusFilter, page]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleUpdate = async (reportId: string, status: string) => {
    setUpdating(true);
    try {
      await api(`/api/admin/reports/${reportId}`, {
        method: "PATCH",
        body: JSON.stringify({ status, adminNotes: notes || undefined }),
      });
      setSelected(null);
      setNotes("");
      fetchReports();
    } catch {}
    setUpdating(false);
  };

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    reviewing: "bg-blue-500/20 text-blue-400",
    resolved: "bg-green-500/20 text-green-400",
    dismissed: "bg-gray-500/20 text-gray-400",
  };

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Reports</h1>
      <div className="flex gap-2">
        {["pending", "reviewing", "resolved", "dismissed"].map((s) => (
          <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => { setStatusFilter(s); setPage(1); }}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>
      {loading ? <p className="text-muted-foreground">Loading...</p> : reports.length === 0 ? <p className="text-muted-foreground">No reports</p> : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="rounded-lg border p-4 cursor-pointer hover:bg-accent/50" onClick={() => { setSelected(r); setNotes(r.adminNotes ?? ""); }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className={statusColors[r.status] ?? ""}>{r.status}</Badge>
                  <span className="text-sm font-medium">{r.reason}</span>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground truncate">{r.messageContent}</p>
              <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                <span>
                  Reported by:{" "}
                  <UserLink userId={r.reporterUserId} name={r.reporterName} username={r.reporterUsername} />
                </span>
                <span className="flex items-center gap-1">
                  Message by:{" "}
                  <SenderDisplay report={r} />
                </span>
              </div>
            </div>
          ))}
          <div className="flex justify-between">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="text-sm text-muted-foreground">{total} total</span>
            <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Report Details</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div><span className="text-sm font-medium">Reason:</span> <span className="text-sm">{selected.reason}</span></div>
              {selected.description && <div><span className="text-sm font-medium">Description:</span> <p className="text-sm text-muted-foreground">{selected.description}</p></div>}
              <div><span className="text-sm font-medium">Message:</span> <p className="text-sm bg-accent rounded p-2 mt-1">{selected.messageContent}</p></div>
              <div className="flex flex-col gap-1">
                <div className="text-sm">
                  <span className="font-medium">Reported by:</span>{" "}
                  <UserLink userId={selected.reporterUserId} name={selected.reporterName} username={selected.reporterUsername} />
                </div>
                <div className="text-sm flex items-center gap-1">
                  <span className="font-medium">Message by:</span>{" "}
                  <SenderDisplay report={selected} />
                </div>
              </div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Admin notes..." className="w-full rounded-md border bg-background px-3 py-2 text-sm" rows={2} />
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => selected && handleUpdate(selected.id, "dismissed")} disabled={updating}>Dismiss</Button>
            <Button variant="default" onClick={() => selected && handleUpdate(selected.id, "resolved")} disabled={updating}>Resolve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
