"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Users,
  UserPlus,
  Mail,
  MailOpen,
  Send,
  Radio,
  Bot,
  Webhook,
  MessageSquareOff,
  BookOpen,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { useAccountStore, type AnalyticsData } from "@/store/account-store";
import { cn } from "@/lib/utils";

interface Broadcast {
  id: string;
  content: string;
  status: "sent" | "scheduled" | "draft";
  createdAt: string;
  sentAt?: string;
  recipientCount?: number;
}

interface KnowledgeItem {
  id: string;
  title: string;
}

interface AccountInfo {
  id: string;
  name: string;
  autoReplyMode: string | null;
  welcomeEnabled: boolean;
  welcomeMessage: string | null;
}

type ChartRange = "7d" | "30d";

export default function OfficialDashboardPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const accountId = params.id as string;
  const loadAnalytics = useAccountStore((s) => s.loadAnalytics);

  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [knowledgeCount, setKnowledgeCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [chartRange, setChartRange] = useState<ChartRange>("7d");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [accountData, analyticsData, broadcastData, knowledgeData] =
        await Promise.all([
          api<AccountInfo>(`/api/accounts/${accountId}`),
          loadAnalytics(accountId),
          api<{ broadcasts: Broadcast[] }>(
            `/api/accounts/${accountId}/broadcasts`,
            { silent: true },
          ).catch(() => ({ broadcasts: [] })),
          api<{ items: KnowledgeItem[] }>(
            `/api/accounts/${accountId}/knowledge`,
            { silent: true },
          ).catch(() => ({ items: [] })),
        ]);

      setAccount(accountData);
      setAnalytics(analyticsData);
      setBroadcasts(broadcastData.broadcasts ?? []);
      setKnowledgeCount(
        Array.isArray(knowledgeData)
          ? knowledgeData.length
          : (knowledgeData.items?.length ?? 0),
      );

      // Derive unread from conversations
      try {
        const convs = await api<
          { id: string; status?: string; unread?: boolean }[]
        >(`/api/accounts/${accountId}/conversations`, { silent: true });
        const unread = convs.filter(
          (c) => c.unread || c.status === "unresolved",
        ).length;
        setUnreadCount(unread);
      } catch {
        setUnreadCount(0);
      }
    } catch {
      // ignore top-level errors
    } finally {
      setLoading(false);
    }
  }, [accountId, loadAnalytics]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Chart data derived from analytics
  const chartData = useMemo(() => {
    if (!analytics?.dailyStats) return [];
    const days = chartRange === "7d" ? 7 : 30;
    const stats = analytics.dailyStats.slice(-days);
    return stats;
  }, [analytics, chartRange]);

  const chartMax = useMemo(() => {
    if (chartData.length === 0) return 1;
    return Math.max(...chartData.map((d) => d.subscribers), 1);
  }, [chartData]);

  // Today's new subscribers
  const todayNew = useMemo(() => {
    if (!analytics?.dailyStats || analytics.dailyStats.length === 0) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const todayStat = analytics.dailyStats.find((d) => d.date === today);
    return todayStat?.subscribers ?? 0;
  }, [analytics]);

  // Total broadcasts sent
  const totalBroadcastsSent = broadcasts.filter(
    (b) => b.status === "sent",
  ).length;

  // Recent 3 broadcasts
  const recentBroadcasts = broadcasts.slice(0, 3);

  // Auto-reply mode label
  const autoReplyModeLabel = account?.autoReplyMode ?? "none";

  const autoReplyIcon =
    autoReplyModeLabel === "ai"
      ? Bot
      : autoReplyModeLabel === "webhook"
        ? Webhook
        : MessageSquareOff;

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
            {t("official.dashboard.title")}
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
            label={t("official.dashboard.subscribers")}
            value={analytics?.subscriberCount ?? 0}
            iconColor="text-blue-500"
          />
          <OverviewCard
            icon={UserPlus}
            label={t("official.dashboard.todayNew")}
            value={todayNew}
            iconColor="text-green-500"
          />
          <OverviewCard
            icon={MailOpen}
            label={t("official.dashboard.unreadMessages")}
            value={unreadCount}
            iconColor="text-orange-500"
          />
          <OverviewCard
            icon={Send}
            label={t("official.dashboard.totalBroadcasts")}
            value={totalBroadcastsSent}
            iconColor="text-purple-500"
          />
        </div>

        {/* Subscriber Growth Chart */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {t("official.dashboard.subscriberGrowth")}
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
                {t("official.dashboard.chart7d")}
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
                {t("official.dashboard.chart30d")}
              </button>
            </div>
          </div>
          {chartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("official.dashboard.noChartData")}
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
                    {/* Show date label for 7d view or every 5th bar in 30d */}
                    {(chartRange === "7d" ||
                      chartData.indexOf(day) % 5 === 0) && (
                      <span className="mt-1 text-[9px] text-muted-foreground">
                        {day.date.slice(5)}
                      </span>
                    )}
                    {/* Tooltip on hover */}
                    <div className="pointer-events-none absolute -top-8 left-1/2 z-20 hidden -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background group-hover:block">
                      {day.subscribers}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Two-column section: Recent Broadcasts + Status cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Recent Broadcasts */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {t("official.dashboard.recentBroadcasts")}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-2 py-1 text-xs"
                onClick={() =>
                  router.push(`/official/${accountId}/broadcast`)
                }
              >
                {t("official.dashboard.viewAll")}
                <ChevronRight className="ml-0.5 h-3 w-3" />
              </Button>
            </div>
            {recentBroadcasts.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t("official.dashboard.noBroadcasts")}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {recentBroadcasts.map((bc) => (
                  <div
                    key={bc.id}
                    className="flex items-start gap-2 rounded-md border border-border p-2.5"
                  >
                    <Radio className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{bc.content}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {bc.sentAt
                          ? new Date(bc.sentAt).toLocaleDateString()
                          : new Date(bc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <BroadcastStatusBadge status={bc.status} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right column: stacked cards */}
          <div className="flex flex-col gap-4">
            {/* Auto-Reply Status */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  {t("official.dashboard.autoReplyStatus")}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto px-2 py-1 text-xs"
                  onClick={() =>
                    router.push(`/official/${accountId}/auto-reply`)
                  }
                >
                  {t("official.dashboard.settings")}
                  <ChevronRight className="ml-0.5 h-3 w-3" />
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {(() => {
                    const Icon = autoReplyIcon;
                    return <Icon className="h-4 w-4 text-muted-foreground" />;
                  })()}
                  <span className="text-sm">
                    {t("official.dashboard.autoReplyMode")}:
                  </span>
                  <Badge variant="secondary">
                    {t(`official.dashboard.autoReplyMode.${autoReplyModeLabel}`)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {t("official.dashboard.welcomeMessage")}:
                  </span>
                  <Badge
                    variant={account?.welcomeEnabled ? "default" : "outline"}
                  >
                    {account?.welcomeEnabled
                      ? t("official.dashboard.on")
                      : t("official.dashboard.off")}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Knowledge Base Status */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  {t("official.dashboard.knowledgeBase")}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto px-2 py-1 text-xs"
                  onClick={() =>
                    router.push(`/official/${accountId}/knowledge`)
                  }
                >
                  {t("official.dashboard.manage")}
                  <ChevronRight className="ml-0.5 h-3 w-3" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {t("official.dashboard.knowledgeItems", {
                    count: knowledgeCount,
                  })}
                </span>
              </div>
            </div>

            {/* Pending Items */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle
                    className={cn(
                      "h-4 w-4",
                      unreadCount > 0
                        ? "text-orange-500"
                        : "text-muted-foreground",
                    )}
                  />
                  <h2 className="text-sm font-semibold">
                    {t("official.dashboard.pendingItems")}
                  </h2>
                </div>
                <span
                  className={cn(
                    "text-lg font-bold",
                    unreadCount > 0 ? "text-orange-500" : "text-foreground",
                  )}
                >
                  {unreadCount}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("official.dashboard.pendingDescription")}
              </p>
            </div>
          </div>
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

function BroadcastStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const variant =
    status === "sent"
      ? "default"
      : status === "scheduled"
        ? "secondary"
        : "outline";

  return (
    <Badge variant={variant} className="shrink-0">
      {t(`official.dashboard.broadcastStatus.${status}`)}
    </Badge>
  );
}
