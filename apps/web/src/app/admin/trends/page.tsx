"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface TrendPoint { date: string; dau: number }
interface TrendsData { trend: TrendPoint[]; mau: number }

export default function AdminTrendsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<TrendsData>("/api/admin/stats/trends?days=30")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">{t("admin.trends.title")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t("admin.trends.mau")}</p>
          <p className="text-2xl font-bold">{data?.mau ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t("admin.trends.avgDau")}</p>
          <p className="text-2xl font-bold">{data?.trend.length ? Math.round(data.trend.reduce((s, d) => s + d.dau, 0) / data.trend.length) : 0}</p>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium mb-4">{t("admin.trends.dauChart")}</h3>
        <div className="flex items-end gap-1 h-40">
          {data?.trend.map((d) => {
            const max = Math.max(...(data?.trend.map((t) => t.dau) ?? [1]));
            const h = max > 0 ? (d.dau / max) * 100 : 0;
            return (
              <div key={d.date} className="flex-1 min-w-[4px] group relative" title={`${d.date}: ${d.dau}`}>
                <div className="bg-brand rounded-t transition-all" style={{ height: `${h}%`, minHeight: d.dau > 0 ? 2 : 0 }} />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>{data?.trend[0]?.date}</span>
          <span>{data?.trend[data.trend.length - 1]?.date}</span>
        </div>
      </div>
    </div>
  );
}
