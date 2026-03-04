"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface DailyDownloads {
  date: string;
  label?: string;
  sticker: number;
  agent: number;
  theme: number;
}

interface DownloadSource {
  key: string;
  label: string;
  total: number;
}

interface DownloadsData {
  sources: DownloadSource[];
  totalDownloads: number;
  dailyData: DailyDownloads[];
}

const SOURCE_COLORS: Record<string, string> = {
  sticker: "#a855f7",
  agent: "#3b82f6",
  theme: "#06b6d4",
};

type Period = "year" | "month" | "week" | "day";
const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: "year", label: "Year" },
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "day", label: "Day" },
];

function addLabel(data: DailyDownloads[]): DailyDownloads[] {
  return data.map((d) => {
    const dt = new Date(d.date + "T00:00:00");
    return { ...d, label: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
  });
}

function aggregateWeekly(data: DailyDownloads[]): DailyDownloads[] {
  const weeks: DailyDownloads[] = [];
  for (let i = 0; i < data.length; i += 7) {
    const chunk = data.slice(i, i + 7);
    if (chunk.length === 0) continue;
    weeks.push({
      date: chunk[0].date,
      label: `${chunk[0].label ?? chunk[0].date} – ${chunk[chunk.length - 1].label ?? chunk[chunk.length - 1].date}`,
      sticker: chunk.reduce((s, d) => s + d.sticker, 0),
      agent: chunk.reduce((s, d) => s + d.agent, 0),
      theme: chunk.reduce((s, d) => s + d.theme, 0),
    });
  }
  return weeks;
}

function aggregateMonthly(data: DailyDownloads[]): DailyDownloads[] {
  if (data.length === 0) return [];
  return [{
    date: data[0].date,
    label: "Monthly Total",
    sticker: data.reduce((s, d) => s + d.sticker, 0),
    agent: data.reduce((s, d) => s + d.agent, 0),
    theme: data.reduce((s, d) => s + d.theme, 0),
  }];
}

function getChartData(data: DailyDownloads[], period: Period): DailyDownloads[] {
  const labeled = addLabel(data);
  switch (period) {
    case "year": return aggregateMonthly(labeled);
    case "month": return aggregateWeekly(labeled);
    case "week": return labeled.slice(-7);
    default: return labeled;
  }
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + p.value, 0);
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg text-xs">
      <p className="mb-1.5 font-medium">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
          <span className="font-medium">{p.value.toLocaleString()}</span>
        </div>
      ))}
      <div className="mt-1.5 border-t border-border pt-1.5 flex justify-between font-semibold">
        <span>Total</span><span>{total.toLocaleString()}</span>
      </div>
    </div>
  );
}

function DownloadsContent() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<DownloadsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<DownloadsData>("/api/creator/downloads?days=30")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(() => getChartData(data?.dailyData ?? [], period), [data, period]);

  if (loading) {
    return (
      <div className="app-dvh flex bg-background">
        <div className="hidden h-full md:block"><IconRail /></div>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const sources = data?.sources ?? [];
  const totalDownloads = data?.totalDownloads ?? 0;

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block"><IconRail /></div>
      <div className="flex flex-1 flex-col min-w-0">
        <div className="shrink-0 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center gap-3">
            <Button size="icon-sm" variant="ghost" onClick={() => router.push("/creator")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Downloads Dashboard</h1>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 md:pb-6">
          <div className="mx-auto max-w-5xl space-y-6">
            {/* Mobile hero */}
            <div className="md:hidden rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-xs text-muted-foreground">Total Downloads</p>
              <p className="mt-1 text-3xl font-bold">{totalDownloads.toLocaleString()}</p>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {sources.map((src) => (
                <div key={src.key} className="rounded-xl border-2 bg-card p-4"
                  style={{ borderColor: `${SOURCE_COLORS[src.key] ?? "#6b7280"}40` }}>
                  <div className="flex items-center gap-2">
                    <Download className="h-4 w-4" style={{ color: SOURCE_COLORS[src.key] }} />
                    <span className="text-xs text-muted-foreground">{src.label}</span>
                  </div>
                  <p className="mt-1 text-xl font-bold">{src.total.toLocaleString()}</p>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="mb-4 flex gap-1">
                {PERIOD_TABS.map((tab) => (
                  <button key={tab.key} onClick={() => setPeriod(tab.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      period === tab.key ? "bg-brand/15 text-brand-text" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}>{tab.label}</button>
                ))}
              </div>
              <div className="h-64 sm:h-80">
                {chartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No download data yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.4 0.04 250 / 0.15)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "oklch(0.6 0.02 260)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "oklch(0.6 0.02 260)" }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "oklch(0.4 0.04 250 / 0.08)" }} />
                      <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      {sources.map((src, i) => (
                        <Bar key={src.key} dataKey={src.key} name={src.label} stackId="downloads"
                          fill={SOURCE_COLORS[src.key] ?? "#6b7280"}
                          radius={i === sources.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>
        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function DownloadsPage() {
  return <AuthGuard><DownloadsContent /></AuthGuard>;
}
