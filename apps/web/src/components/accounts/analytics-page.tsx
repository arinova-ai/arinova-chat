"use client";

import { useState, useEffect } from "react";
import { BarChart3, Users, Gift, MessageSquare, TrendingUp } from "lucide-react";
import { useAccountStore, type Account, type AnalyticsData } from "@/store/account-store";
import { useTranslation } from "@/lib/i18n";

interface Props {
  account: Account;
}

export function AnalyticsPage({ account }: Props) {
  const { t } = useTranslation();
  const loadAnalytics = useAccountStore((s) => s.loadAnalytics);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    loadAnalytics(account.id)
      .then(setData)
      .finally(() => setLoading(false));
  }, [account.id, loadAnalytics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (!data) return null;

  const stats = [
    { label: t("accounts.analyticsSubscribers"), value: data.subscriberCount, icon: Users, color: "text-blue-500" },
    { label: t("accounts.analyticsGifts"), value: data.totalGifts, icon: Gift, color: "text-pink-500" },
    { label: t("accounts.analyticsGiftAmount"), value: data.totalGiftAmount, icon: TrendingUp, color: "text-green-500" },
    { label: t("accounts.analyticsConversations"), value: data.conversationCount, icon: MessageSquare, color: "text-purple-500" },
  ];

  // Simple bar chart using CSS
  const maxGifts = Math.max(...data.dailyStats.map((d) => d.gifts), 1);
  const maxSubs = Math.max(...data.dailyStats.map((d) => d.subscribers), 1);

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-brand" />
        <h2 className="text-lg font-semibold">{t("accounts.analytics")}</h2>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold">{stat.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Daily chart */}
      <div className="rounded-xl border border-border p-4">
        <h3 className="text-sm font-medium mb-4">{t("accounts.dailyStats")}</h3>
        <div className="flex items-end gap-1 h-40">
          {data.dailyStats.slice(-30).map((day) => (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1" title={`${day.date}: ${day.gifts} gifts, ${day.subscribers} subs`}>
              <div className="w-full flex flex-col gap-0.5">
                <div
                  className="w-full bg-pink-500/60 rounded-t"
                  style={{ height: `${(day.gifts / maxGifts) * 80}px` }}
                />
                <div
                  className="w-full bg-blue-500/60 rounded-t"
                  style={{ height: `${(day.subscribers / maxSubs) * 40}px` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-pink-500/60" />
            {t("accounts.analyticsGifts")}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-blue-500/60" />
            {t("accounts.analyticsSubscribers")}
          </span>
        </div>
      </div>
    </div>
  );
}
