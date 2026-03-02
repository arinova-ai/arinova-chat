"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Star, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import {
  AVG_RATING, TOTAL_REVIEWS, RATING_CHANGE, RATING_DISTRIBUTION,
  DAILY_DATA, aggregateWeekly, aggregateMonthly, RECENT_REVIEWS,
  type DailyRatings,
} from "./mock-data";

type Period = "year" | "month" | "week" | "day";
const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: "year", label: "Year" },
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "day", label: "Day" },
];

function getChartData(period: Period): DailyRatings[] {
  switch (period) {
    case "year": return aggregateMonthly(DAILY_DATA);
    case "month": return aggregateWeekly(DAILY_DATA);
    case "week": return DAILY_DATA.slice(-7);
    default: return DAILY_DATA;
  }
}

const STAR_COLORS: Record<string, string> = {
  star5: "#22c55e",
  star4: "#3b82f6",
  star3: "#eab308",
  star2: "#f97316",
  star1: "#ef4444",
};

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

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i <= rating ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground/30"}`}
        />
      ))}
    </span>
  );
}

function RatingsContent() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("month");
  const chartData = getChartData(period);

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
              <h1 className="text-lg font-bold">Ratings Dashboard</h1>
              <p className="text-xs text-muted-foreground">Feb 1 – Mar 2, 2026</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 md:pb-6">
          <div className="mx-auto max-w-5xl space-y-6">
            {/* Summary row */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border-2 border-yellow-500/40 bg-card p-4">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                  <span className="text-xs text-muted-foreground">Average Rating</span>
                </div>
                <p className="mt-1 text-xl font-bold">{AVG_RATING}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-green-400">
                  <TrendingUp className="h-3 w-3" />+{RATING_CHANGE}%
                </p>
              </div>
              <div className="rounded-xl border-2 border-blue-500/40 bg-card p-4">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-blue-400" />
                  <span className="text-xs text-muted-foreground">Total Reviews</span>
                </div>
                <p className="mt-1 text-xl font-bold">{TOTAL_REVIEWS}</p>
              </div>
              {/* Distribution */}
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-2">Distribution</p>
                {RATING_DISTRIBUTION.map((r) => (
                  <div key={r.stars} className="flex items-center gap-2 mb-1 last:mb-0">
                    <span className="text-[10px] w-6 text-right">{r.stars}★</span>
                    <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${r.pct}%`, backgroundColor: STAR_COLORS[`star${r.stars}`] }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-6">{r.count}</span>
                  </div>
                ))}
              </div>
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
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.4 0.04 250 / 0.15)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "oklch(0.6 0.02 260)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "oklch(0.6 0.02 260)" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "oklch(0.4 0.04 250 / 0.08)" }} />
                    <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="star1" name="1 Star" stackId="ratings" fill="#ef4444" />
                    <Bar dataKey="star2" name="2 Stars" stackId="ratings" fill="#f97316" />
                    <Bar dataKey="star3" name="3 Stars" stackId="ratings" fill="#eab308" />
                    <Bar dataKey="star4" name="4 Stars" stackId="ratings" fill="#3b82f6" />
                    <Bar dataKey="star5" name="5 Stars" stackId="ratings" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Reviews */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3 sm:px-5">
                <h2 className="text-sm font-semibold">Recent Reviews</h2>
              </div>
              <div className="divide-y divide-border">
                {RECENT_REVIEWS.map((review) => (
                  <div key={review.id} className="px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{review.userName}</span>
                      <StarDisplay rating={review.rating} />
                      <span className="ml-auto text-[11px] text-muted-foreground">{review.date}</span>
                    </div>
                    <p className="text-sm text-foreground/80">{review.comment}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{review.product}</p>
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

export default function RatingsPage() {
  return <AuthGuard><RatingsContent /></AuthGuard>;
}
