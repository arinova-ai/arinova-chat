"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  TrendingUp,
  Coins,
  Smile,
  Bot,
  Palette,
  Users,
  Globe,
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
import {
  REVENUE_SOURCES,
  TOTAL_REVENUE,
  TOTAL_CHANGE,
  DAILY_DATA,
  aggregateWeekly,
  aggregateMonthly,
  MOCK_TRANSACTIONS,
  type DailyRevenue,
} from "./mock-data";

// ---------------------------------------------------------------------------
// Period tabs
// ---------------------------------------------------------------------------

type Period = "year" | "month" | "week" | "day";
const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: "year", label: "Year" },
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "day", label: "Day" },
];

function getChartData(period: Period): DailyRevenue[] {
  switch (period) {
    case "year":
      return aggregateMonthly(DAILY_DATA);
    case "month":
      return aggregateWeekly(DAILY_DATA);
    case "week":
      return DAILY_DATA.slice(-7);
    case "day":
    default:
      return DAILY_DATA;
  }
}

// Source icon mapping
const SOURCE_ICONS: Record<string, typeof Coins> = {
  sticker: Smile,
  agent: Bot,
  theme: Palette,
  community: Users,
  spaces: Globe,
};

// Source card color ring classes
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
// Custom Tooltip
// ---------------------------------------------------------------------------

function ChartTooltip({
  active,
  payload,
  label,
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
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: p.color }}
            />
            {p.name}
          </span>
          <span className="font-medium">${p.value.toLocaleString()}</span>
        </div>
      ))}
      <div className="mt-1.5 border-t border-border pt-1.5 flex justify-between font-semibold">
        <span>Total</span>
        <span>${total.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Revenue Content
// ---------------------------------------------------------------------------

function RevenueContent() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("month");
  const chartData = getChartData(period);

  return (
    <div className="app-dvh flex bg-background">
      {/* Desktop sidebar */}
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center gap-3">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => router.push("/creator")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Revenue Dashboard</h1>
              <p className="text-xs text-muted-foreground">
                Feb 1 – Mar 2, 2026
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 md:pb-6">
          <div className="mx-auto max-w-5xl space-y-6">
            {/* ---- Mobile: Total revenue hero ---- */}
            <div className="md:hidden rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-xs text-muted-foreground">Total Revenue</p>
              <p className="mt-1 text-3xl font-bold">
                ${TOTAL_REVENUE.toLocaleString()}
              </p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-green-400">
                <TrendingUp className="h-3.5 w-3.5" />+{TOTAL_CHANGE}%
              </p>
            </div>

            {/* ---- Summary cards (desktop: horizontal, mobile: vertical) ---- */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5">
              {REVENUE_SOURCES.map((src) => {
                const Icon = SOURCE_ICONS[src.key];
                return (
                  <div
                    key={src.key}
                    className={`rounded-xl border-2 ${SOURCE_RING[src.key]} bg-card p-4`}
                  >
                    <div className="flex items-center gap-2">
                      {Icon && (
                        <Icon
                          className={`h-4 w-4 ${SOURCE_TEXT[src.key]}`}
                        />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {src.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xl font-bold">
                      ${src.total.toLocaleString()}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-green-400">
                      <TrendingUp className="h-3 w-3" />+{src.change}%
                    </p>
                  </div>
                );
              })}
            </div>

            {/* ---- Stacked Bar Chart ---- */}
            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              {/* Period tabs */}
              <div className="mb-4 flex gap-1">
                {PERIOD_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setPeriod(tab.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      period === tab.key
                        ? "bg-brand/15 text-brand-text"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Chart */}
              <div className="h-64 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="oklch(0.4 0.04 250 / 0.15)"
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "oklch(0.6 0.02 260)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "oklch(0.6 0.02 260)" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `$${v}`}
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      cursor={{ fill: "oklch(0.4 0.04 250 / 0.08)" }}
                    />
                    <Legend
                      iconType="square"
                      iconSize={10}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                    {REVENUE_SOURCES.map((src) => (
                      <Bar
                        key={src.key}
                        dataKey={src.key}
                        name={src.label}
                        stackId="revenue"
                        fill={src.color}
                        radius={
                          src.key === "spaces"
                            ? [4, 4, 0, 0]
                            : [0, 0, 0, 0]
                        }
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ---- Recent Transactions ---- */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3 sm:px-5">
                <h2 className="text-sm font-semibold">Recent Transactions</h2>
              </div>
              <div className="divide-y divide-border">
                {MOCK_TRANSACTIONS.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center gap-3 px-4 py-3 sm:px-5"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <Coins className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {tx.description}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {tx.source} · {tx.date}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-green-400">
                      +${tx.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function RevenuePage() {
  return (
    <AuthGuard>
      <RevenueContent />
    </AuthGuard>
  );
}
