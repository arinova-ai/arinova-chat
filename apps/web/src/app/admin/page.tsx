"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import {
  Users,
  MessageSquare,
  Bot,
  MessagesSquare,
  UserPlus,
  Loader2,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface Stats {
  totalUsers: number;
  totalConversations: number;
  totalMessages: number;
  totalAgents: number;
  recentUsers: number;
}

const STAT_CARDS = [
  { key: "totalUsers" as const, labelKey: "admin.dashboard.totalUsers", icon: Users },
  { key: "totalConversations" as const, labelKey: "admin.dashboard.conversations", icon: MessagesSquare },
  { key: "totalMessages" as const, labelKey: "admin.dashboard.messages", icon: MessageSquare },
  { key: "totalAgents" as const, labelKey: "admin.dashboard.agents", icon: Bot },
  { key: "recentUsers" as const, labelKey: "admin.dashboard.newUsers7d", icon: UserPlus },
];

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Stats>("/api/admin/stats")
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t("admin.dashboard.failedToLoad")}
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="mb-6 text-xl font-bold text-foreground">{t("admin.dashboard.title")}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STAT_CARDS.map((card) => (
          <div
            key={card.key}
            className="rounded-lg border border-border bg-card p-5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
                <card.icon className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t(card.labelKey)}</p>
                <p className="text-2xl font-bold text-foreground">
                  {stats[card.key].toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
