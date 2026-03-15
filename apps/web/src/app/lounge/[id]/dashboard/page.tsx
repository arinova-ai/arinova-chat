"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Users,
  UserPlus,
  DollarSign,
  MessageSquare,
  Mic,
  Brain,
  Trophy,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { useAccountStore, type AnalyticsData } from "@/store/account-store";
import { cn } from "@/lib/utils";

interface AccountInfo {
  id: string;
  name: string;
  persona: {
    nickname?: string;
    bio?: string;
    personality?: string;
    greeting?: string;
    scenario?: string;
    exampleDialogue?: string;
  } | null;
  voiceModelStatus: "ready" | "training" | "none";
  systemPrompt?: string | null;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  userImage: string | null;
  totalGifted: number;
}

interface Conversation {
  id: string;
  userName: string;
  lastMessage: string;
  updatedAt: string;
}

type ChartRange = "7d" | "30d";

const PERSONA_FIELDS = [
  "nickname",
  "bio",
  "personality",
  "greeting",
  "scenario",
  "exampleDialogue",
] as const;

export default function LoungeDashboardPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const accountId = params.id as string;
  const loadAnalytics = useAccountStore((s) => s.loadAnalytics);
  const loadLeaderboard = useAccountStore((s) => s.loadLeaderboard);

  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartRange, setChartRange] = useState<ChartRange>("7d");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [accountData, analyticsData, leaderboardData, conversationData] =
        await Promise.all([
          api<AccountInfo>(`/api/accounts/${accountId}`),
          loadAnalytics(accountId),
          loadLeaderboard(accountId).catch(() => [] as LeaderboardEntry[]),
          api<Conversation[]>(
            `/api/accounts/${accountId}/conversations`,
            { silent: true },
          ).catch(() => [] as Conversation[]),
        ]);

      setAccount(accountData);
      setAnalytics(analyticsData);
      setLeaderboard(leaderboardData ?? []);
      setConversations(
        Array.isArray(conversationData) ? conversationData.slice(0, 3) : [],
      );
    } catch {
      // ignore top-level errors
    } finally {
      setLoading(false);
    }
  }, [accountId, loadAnalytics, loadLeaderboard]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Chart data derived from analytics
  const chartData = useMemo(() => {
    if (!analytics?.dailyStats) return [];
    const days = chartRange === "7d" ? 7 : 30;
    return analytics.dailyStats.slice(-days);
  }, [analytics, chartRange]);

  const chartMax = useMemo(() => {
    if (chartData.length === 0) return 1;
    return Math.max(...chartData.map((d) => d.subscribers), 1);
  }, [chartData]);

  // Today's new fans
  const todayNew = useMemo(() => {
    if (!analytics?.dailyStats || analytics.dailyStats.length === 0) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const todayStat = analytics.dailyStats.find((d) => d.date === today);
    return todayStat?.subscribers ?? 0;
  }, [analytics]);

  // Persona completion percentage
  const personaCompletion = useMemo(() => {
    if (!account?.persona) return 0;
    const filled = PERSONA_FIELDS.filter(
      (f) => account.persona && account.persona[f],
    ).length;
    return Math.round((filled / PERSONA_FIELDS.length) * 100);
  }, [account]);

  return (
    <div className="flex min-h-screen flex-col bg-background pt-[env(safe-area-inset-top)]">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">
            {account?.name ?? "..."}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("lounge.dashboard.title")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchData}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="flex-1 space-y-4 px-4 py-4">
        {/* Overview Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <OverviewCard
            icon={Users}
            label={t("lounge.dashboard.fans")}
            value={analytics?.subscriberCount ?? 0}
            iconColor="text-blue-500"
          />
          <OverviewCard
            icon={UserPlus}
            label={t("lounge.dashboard.todayNew")}
            value={todayNew}
            iconColor="text-green-500"
          />
          <OverviewCard
            icon={DollarSign}
            label={t("lounge.dashboard.totalIncome")}
            value={analytics?.totalGiftAmount ?? 0}
            iconColor="text-orange-500"
          />
          <OverviewCard
            icon={MessageSquare}
            label={t("lounge.dashboard.conversations")}
            value={analytics?.conversationCount ?? 0}
            iconColor="text-purple-500"
          />
        </div>

        {/* Fan Growth Chart */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {t("lounge.dashboard.fanGrowth")}
            </h2>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setChartRange("7d")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  chartRange === "7d"
                    ? "bg-blue-600 text-white"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {t("lounge.dashboard.chart7d")}
              </button>
              <button
                type="button"
                onClick={() => setChartRange("30d")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  chartRange === "30d"
                    ? "bg-blue-600 text-white"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {t("lounge.dashboard.chart30d")}
              </button>
            </div>
          </div>
          {chartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("lounge.dashboard.noChartData")}
            </p>
          ) : (
            <div className="flex items-end gap-1" style={{ height: 120 }}>
              {chartData.map((day) => {
                const height = Math.max(
                  (day.subscribers / chartMax) * 100,
                  2,
                );
                return (
                  <div
                    key={day.date}
                    className="group relative flex flex-1 flex-col items-center"
                  >
                    <div
                      className="w-full rounded-t bg-blue-500 transition-colors group-hover:bg-blue-400"
                      style={{ height: `${height}%` }}
                      title={`${day.date}: ${day.subscribers}`}
                    />
                    {(chartRange === "7d" ||
                      chartData.indexOf(day) % 5 === 0) && (
                      <span className="mt-1 text-[9px] text-muted-foreground">
                        {day.date.slice(5)}
                      </span>
                    )}
                    <div className="pointer-events-none absolute -top-8 left-1/2 z-20 hidden -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background group-hover:block">
                      {day.subscribers}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Two-column section: AI Status + Gift Leaderboard */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* AI Status Card */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">
              {t("lounge.dashboard.aiStatus")}
            </h2>
            <div className="flex flex-col gap-3">
              {/* Persona Completion */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {t("lounge.dashboard.personaCompletion")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-20 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        personaCompletion === 100
                          ? "bg-green-500"
                          : personaCompletion >= 50
                            ? "bg-blue-500"
                            : "bg-orange-500",
                      )}
                      style={{ width: `${personaCompletion}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium">
                    {personaCompletion}%
                  </span>
                </div>
              </div>

              {/* Voice Model Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {t("lounge.dashboard.voiceModel")}
                  </span>
                </div>
                <Badge
                  variant={
                    account?.voiceModelStatus === "ready"
                      ? "default"
                      : account?.voiceModelStatus === "training"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {account?.voiceModelStatus === "ready"
                    ? t("lounge.dashboard.configured")
                    : account?.voiceModelStatus === "training"
                      ? "Training..."
                      : t("lounge.dashboard.notConfigured")}
                </Badge>
              </div>

              {/* System Prompt Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {t("lounge.dashboard.systemPrompt")}
                  </span>
                </div>
                <Badge
                  variant={account?.systemPrompt ? "default" : "outline"}
                >
                  {account?.systemPrompt
                    ? t("lounge.dashboard.configured")
                    : t("lounge.dashboard.notConfigured")}
                </Badge>
              </div>
            </div>
          </div>

          {/* Gift Leaderboard */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-500" />
                <h2 className="text-sm font-semibold">
                  {t("lounge.dashboard.giftLeaderboard")}
                </h2>
              </div>
            </div>
            {leaderboard.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t("lounge.dashboard.noLeaderboard")}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {leaderboard.slice(0, 5).map((entry) => (
                  <div
                    key={entry.userId}
                    className="flex items-center gap-3 rounded-md border border-border p-2.5"
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        entry.rank === 1
                          ? "bg-yellow-500/20 text-yellow-600"
                          : entry.rank === 2
                            ? "bg-gray-300/20 text-gray-500"
                            : entry.rank === 3
                              ? "bg-orange-400/20 text-orange-500"
                              : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {entry.rank}
                    </span>
                    {entry.userImage ? (
                      <img
                        src={entry.userImage}
                        alt={entry.userName}
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-muted-foreground">
                        {entry.userName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {entry.userName}
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-orange-500">
                      {entry.totalGifted.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Conversations */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {t("lounge.dashboard.recentConversations")}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs"
              onClick={() =>
                router.push(`/lounge/${accountId}/conversations`)
              }
            >
              {t("lounge.dashboard.viewAll")}
              <ChevronRight className="ml-0.5 h-3 w-3" />
            </Button>
          </div>
          {conversations.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("lounge.dashboard.noConversations")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className="flex items-start gap-2 rounded-md border border-border p-2.5"
                >
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {conv.userName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {conv.lastMessage}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {new Date(conv.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function OverviewCard({
  icon: Icon,
  label,
  value,
  iconColor,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  iconColor?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <Icon className={cn("h-4 w-4", iconColor ?? "text-muted-foreground")} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
