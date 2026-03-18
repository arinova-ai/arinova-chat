"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Health { status: string; onlineUsers: number; activeStreams: number; messagesLastHour: number; dbConnected: boolean }

export default function AdminHealthPage() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch_ = () => {
    setLoading(true);
    api<Health>("/api/admin/health").then(setData).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetch_(); }, []);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold">Server Health</h2>
        <Button variant="outline" size="sm" onClick={fetch_} disabled={loading}><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
      </div>
      {loading && !data ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card label="Status" value={data.status} color={data.status === "ok" ? "text-green-400" : "text-red-400"} />
          <Card label="Online Users" value={String(data.onlineUsers)} />
          <Card label="Active Streams" value={String(data.activeStreams)} />
          <Card label="Messages (1h)" value={String(data.messagesLastHour)} />
          <Card label="DB Connected" value={data.dbConnected ? "Yes" : "No"} color={data.dbConnected ? "text-green-400" : "text-red-400"} />
        </div>
      )}
    </div>
  );
}

function Card({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${color ?? ""}`}>{value}</p>
    </div>
  );
}
