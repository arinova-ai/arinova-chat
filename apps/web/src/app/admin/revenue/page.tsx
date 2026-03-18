"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface RevData { totalRevenue: number; totalPurchases: number; platformFees: number; trend: { date: string; topup: number; spend: number }[] }

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<RevData>("/api/admin/stats/revenue").then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Revenue Analytics</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Top-ups</p>
          <p className="text-2xl font-bold">{data?.totalRevenue ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Purchases</p>
          <p className="text-2xl font-bold">{data?.totalPurchases ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Platform Fees</p>
          <p className="text-2xl font-bold">{data?.platformFees ?? 0}</p>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium mb-4">30-Day Revenue Trend</h3>
        <div className="flex items-end gap-1 h-40">
          {data?.trend.map((d) => {
            const max = Math.max(...(data?.trend.map((t) => t.topup + t.spend) ?? [1]), 1);
            const h = ((d.topup + d.spend) / max) * 100;
            return (
              <div key={d.date} className="flex-1 min-w-[4px]" title={`${d.date}: +${d.topup} / -${d.spend}`}>
                <div className="bg-green-500/80 rounded-t" style={{ height: `${(d.topup / max) * 100}%`, minHeight: d.topup > 0 ? 2 : 0 }} />
                <div className="bg-orange-500/80" style={{ height: `${(d.spend / max) * 100}%`, minHeight: d.spend > 0 ? 2 : 0 }} />
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded bg-green-500" />Top-up</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded bg-orange-500" />Spend</span>
        </div>
      </div>
    </div>
  );
}
