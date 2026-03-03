"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Users, UserPlus, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import {
  TOTAL_USERS, TOTAL_CHANGE, NEW_USERS_30D, RETURNING_30D,
  DAILY_DATA, aggregateWeekly, aggregateMonthly, type DailyUsers,
} from "./mock-data";

type Period = "year" | "month" | "week" | "day";
const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: "year", label: "Year" },
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "day", label: "Day" },
];

function getChartData(period: Period): DailyUsers[] {
  switch (period) {
    case "year": return aggregateMonthly(DAILY_DATA);
    case "month": return aggregateWeekly(DAILY_DATA);
    case "week": return DAILY_DATA.slice(-7);
    default: return DAILY_DATA;
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

function UsersContent() {
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
              <h1 className="text-lg font-bold">Users Dashboard</h1>
              <p className="text-xs text-muted-foreground">Feb 1 – Mar 2, 2026</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 md:pb-6">
          <div className="mx-auto max-w-5xl space-y-6">
            {/* Mobile hero */}
            <div className="md:hidden rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-xs text-muted-foreground">Total Users</p>
              <p className="mt-1 text-3xl font-bold">{TOTAL_USERS.toLocaleString()}</p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-green-400">
                <TrendingUp className="h-3.5 w-3.5" />+{TOTAL_CHANGE}%
              </p>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border-2 border-green-500/40 bg-card p-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-green-400" />
                  <span className="text-xs text-muted-foreground">Total Users</span>
                </div>
                <p className="mt-1 text-xl font-bold">{TOTAL_USERS.toLocaleString()}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-green-400">
                  <TrendingUp className="h-3 w-3" />+{TOTAL_CHANGE}%
                </p>
              </div>
              <div className="rounded-xl border-2 border-blue-500/40 bg-card p-4">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-blue-400" />
                  <span className="text-xs text-muted-foreground">New Users (30d)</span>
                </div>
                <p className="mt-1 text-xl font-bold">{NEW_USERS_30D.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border-2 border-purple-500/40 bg-card p-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-purple-400" />
                  <span className="text-xs text-muted-foreground">Returning (30d)</span>
                </div>
                <p className="mt-1 text-xl font-bold">{RETURNING_30D.toLocaleString()}</p>
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
                    <Bar dataKey="newUsers" name="New Users" stackId="users" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="returning" name="Returning" stackId="users" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function UsersPage() {
  return <AuthGuard><UsersContent /></AuthGuard>;
}
