"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Coins,
  Smile,
  Bot,
  Palette,
  Users,
  Globe,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DailyRevenue {
  date: string;
  label?: string;
  sticker: number;
  agent: number;
  theme: number;
  community: number;
  spaces: number;
}

interface Transaction {
  id: string;
  date: string;
  source: string;
  description: string | null;
  amount: number;
}

interface RevenueData {
  total: number;
  sources: Record<string, number>;
  dailyData: DailyRevenue[];
  transactions: Transaction[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_KEYS = ["sticker", "agent", "theme", "community", "spaces"] as const;
const SOURCE_COLORS: Record<string, string> = {
  sticker: "#a855f7",
  agent: "#3b82f6",
  theme: "#06b6d4",
  community: "#f97316",
  spaces: "#22c55e",
};

const SOURCE_ICONS: Record<string, typeof Coins> = {
  sticker: Smile,
  agent: Bot,
  theme: Palette,
  community: Users,
  spaces: Globe,
};

const SOURCE_RING: Record<string, string> = {
  sticker: "border-purple-500/40",
  agent: "border-blue-500/40",
  theme: "border-cyan-500/40",
  community: "border-orange-500/40",
  spaces: "border-green-500/40",
};

const SOURCE_TEXT: Record<string, string> = {
  sticker: "text-purple-400",
  agent: "text-blue-400",
  theme: "text-cyan-400",
  community: "text-orange-400",
  spaces: "text-green-400",
};

// ---------------------------------------------------------------------------
// Period tabs + aggregation
// ---------------------------------------------------------------------------

type Period = "year" | "month" | "week" | "day";
const PERIOD_KEYS: Period[] = ["year", "month", "week", "day"];

function addLabel(data: DailyRevenue[]): DailyRevenue[] {
  return data.map((d) => {
    const dt = new Date(d.date + "T00:00:00");
    return { ...d, label: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
  });
}

function aggregateWeekly(data: DailyRevenue[]): DailyRevenue[] {
  const weeks: DailyRevenue[] = [];
  for (let i = 0; i < data.length; i += 7) {
    const chunk = data.slice(i, i + 7);
    if (chunk.length === 0) continue;
    weeks.push({
      date: chunk[0].date,
      label: `${chunk[0].label ?? chunk[0].date} – ${chunk[chunk.length - 1].label ?? chunk[chunk.length - 1].date}`,
      sticker: chunk.reduce((s, d) => s + d.sticker, 0),
      agent: chunk.reduce((s, d) => s + d.agent, 0),
      theme: chunk.reduce((s, d) => s + d.theme, 0),
      community: chunk.reduce((s, d) => s + d.community, 0),
      spaces: chunk.reduce((s, d) => s + d.spaces, 0),
    });
  }
  return weeks;
}

function aggregateMonthly(data: DailyRevenue[]): DailyRevenue[] {
  if (data.length === 0) return [];
  return [{
    date: data[0].date,
    label: "Monthly Total",
    sticker: data.reduce((s, d) => s + d.sticker, 0),
    agent: data.reduce((s, d) => s + d.agent, 0),
    theme: data.reduce((s, d) => s + d.theme, 0),
    community: data.reduce((s, d) => s + d.community, 0),
    spaces: data.reduce((s, d) => s + d.spaces, 0),
  }];
}

function getChartData(data: DailyRevenue[], period: Period): DailyRevenue[] {
  const labeled = addLabel(data);
  switch (period) {
    case "year": return aggregateMonthly(labeled);
    case "month": return aggregateWeekly(labeled);
    case "week": return labeled.slice(-7);
    default: return labeled;
  }
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

function ChartTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
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

// ---------------------------------------------------------------------------
// Revenue Content
// ---------------------------------------------------------------------------

function RevenueContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<RevenueData>("/api/creator/revenue?days=30")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sources = useMemo(() => {
    return SOURCE_KEYS.map((key) => ({
      key,
      label: t(`creator.revenue.source.${key}`),
      color: SOURCE_COLORS[key],
      total: data?.sources[key] ?? 0,
    }));
  }, [data, t]);

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
              <h1 className="text-lg font-bold">{t("creator.revenue.title")}</h1>
              <p className="text-xs text-muted-foreground">{t("creator.revenue.last30days")}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 md:pb-6">
          <div className="mx-auto max-w-5xl space-y-6">
            {/* Mobile hero */}
            <div className="md:hidden rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-xs text-muted-foreground">{t("creator.revenue.totalRevenue")}</p>
              <p className="mt-1 text-3xl font-bold">{(data?.total ?? 0).toLocaleString()}</p>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5">
              {sources.map((src) => {
                const Icon = SOURCE_ICONS[src.key];
                return (
                  <div key={src.key} className={`rounded-xl border-2 ${SOURCE_RING[src.key]} bg-card p-4`}>
                    <div className="flex items-center gap-2">
                      {Icon && <Icon className={`h-4 w-4 ${SOURCE_TEXT[src.key]}`} />}
                      <span className="text-xs text-muted-foreground">{src.label}</span>
                    </div>
                    <p className="mt-1 text-xl font-bold">{src.total.toLocaleString()}</p>
                  </div>
                );
              })}
            </div>

            {/* Stacked Bar Chart */}
            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="mb-4 flex gap-1">
                {PERIOD_KEYS.map((key) => (
                  <button key={key} onClick={() => setPeriod(key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      period === key ? "bg-brand/15 text-brand-text" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}>{t(`creator.revenue.period.${key}`)}</button>
                ))}
              </div>
              <div className="h-64 sm:h-80">
                {chartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    {t("creator.revenue.noData")}
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
                        <Bar key={src.key} dataKey={src.key} name={src.label} stackId="revenue" fill={src.color}
                          radius={i === sources.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3 sm:px-5">
                <h2 className="text-sm font-semibold">{t("creator.revenue.recentTransactions")}</h2>
              </div>
              {(data?.transactions.length ?? 0) === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("creator.revenue.noTransactions")}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {data!.transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                        <Coins className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{tx.description ?? tx.source}</p>
                        <p className="text-[11px] text-muted-foreground">{tx.source}</p>
                      </div>
                      <span className="text-sm font-semibold text-green-400">+{tx.amount}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function RevenuePage() {
  return <AuthGuard><RevenueContent /></AuthGuard>;
}
