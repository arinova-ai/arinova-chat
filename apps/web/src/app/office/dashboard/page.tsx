"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Coins, Users, CheckCircle2, ArrowUpDown } from "lucide-react";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────

interface DashboardSummary {
  todayTokens: number;
  todayInputTokens: number;
  todayOutputTokens: number;
  todayCostUsd: string;
  activeAgents: number;
  tasksDone: number;
}

interface UsageTrendItem {
  date: string;
  agentId: string;
  agentName: string | null;
  inputTokens: number;
  outputTokens: number;
}

interface AgentRankItem {
  agentId: string;
  agentName: string | null;
  totalTokens: number;
  sessionDurationMs: number;
  requestCount: number;
}

type Period = "7d" | "30d" | "90d";
type SortKey = "tokens" | "sessions" | "requests";

// ── Helpers ───────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── Summary Card ──────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold text-foreground">{value}</div>
    </div>
  );
}

// ── Bar Chart (CSS only) ──────────────────────────────────────

function UsageBarChart({ data }: { data: { date: string; tokens: number }[] }) {
  const maxTokens = Math.max(...data.map((d) => d.tokens), 1);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground mb-4">Token Usage</h3>
      {data.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">No usage data yet</p>
      ) : (
        <div className="flex items-end gap-1 h-40">
          {data.map((d) => {
            const pct = (d.tokens / maxTokens) * 100;
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="text-[9px] text-muted-foreground/60 truncate">
                  {d.tokens > 0 ? formatTokens(d.tokens) : ""}
                </div>
                <div
                  className="w-full rounded-t bg-brand/70 transition-all duration-300 min-h-[2px]"
                  style={{ height: `${Math.max(pct, 1)}%` }}
                />
                <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                  {formatDate(d.date)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Agent Table ───────────────────────────────────────────────

function AgentTable({
  agents,
  sortKey,
  onSort,
}: {
  agents: AgentRankItem[];
  sortKey: SortKey;
  onSort: (key: SortKey) => void;
}) {
  const headers: { key: SortKey; label: string }[] = [
    { key: "tokens", label: "Tokens" },
    { key: "requests", label: "Requests" },
    { key: "sessions", label: "Duration" },
  ];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Agent Ranking</h3>
      </div>
      {agents.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">No agent data yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">Agent</th>
                {headers.map((h) => (
                  <th key={h.key} className="text-right px-4 py-2 font-medium">
                    <button
                      type="button"
                      onClick={() => onSort(h.key)}
                      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
                        sortKey === h.key ? "text-brand-text" : ""
                      }`}
                    >
                      {h.label}
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.agentId} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-2.5 text-foreground font-medium">
                    {a.agentName ?? a.agentId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground font-mono text-xs">
                    {formatTokens(a.totalTokens)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground font-mono text-xs">
                    {a.requestCount}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground font-mono text-xs">
                    {formatDuration(a.sessionDurationMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function OfficeDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [usage, setUsage] = useState<UsageTrendItem[]>([]);
  const [agents, setAgents] = useState<AgentRankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("7d");
  const [sortKey, setSortKey] = useState<SortKey>("tokens");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, u, a] = await Promise.all([
        api<DashboardSummary>("/api/office/dashboard/summary", { silent: true }),
        api<UsageTrendItem[]>(`/api/office/dashboard/usage?period=${period}`, { silent: true }),
        api<AgentRankItem[]>(`/api/office/dashboard/agents?period=${period}&sort=${sortKey}`, { silent: true }),
      ]);
      setSummary(s);
      setUsage(u);
      setAgents(a);
    } catch { /* ignore */ }
    setLoading(false);
  }, [period, sortKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Aggregate usage by date for bar chart
  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of usage) {
      const prev = map.get(u.date) ?? 0;
      map.set(u.date, prev + u.inputTokens + u.outputTokens);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, tokens]) => ({ date, tokens }));
  }, [usage]);

  if (loading && !summary) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Period selector */}
      <div className="flex items-center gap-1.5">
        {(["7d", "30d", "90d"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              period === p
                ? "bg-brand/15 text-brand-text"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          icon={BarChart3}
          label="Today Tokens"
          value={summary ? formatTokens(summary.todayTokens) : "0"}
          color="bg-blue-600/15 text-blue-400"
        />
        <SummaryCard
          icon={Coins}
          label="Today Cost"
          value={summary ? `$${summary.todayCostUsd}` : "$0"}
          color="bg-emerald-600/15 text-emerald-400"
        />
        <SummaryCard
          icon={Users}
          label="Active Agents"
          value={String(summary?.activeAgents ?? 0)}
          color="bg-purple-600/15 text-purple-400"
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Tasks Done"
          value={String(summary?.tasksDone ?? 0)}
          color="bg-amber-600/15 text-amber-400"
        />
      </div>

      {/* Usage chart */}
      <UsageBarChart data={chartData} />

      {/* Agent ranking */}
      <AgentTable agents={agents} sortKey={sortKey} onSort={setSortKey} />
    </div>
  );
}
