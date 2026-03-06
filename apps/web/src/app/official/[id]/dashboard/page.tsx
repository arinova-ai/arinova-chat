"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Headset, Users, BarChart3, Settings, RefreshCw, CheckCircle2, Clock, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type DashTab = "queue" | "team" | "stats" | "settings";

interface QueueItem {
  conversationId: string;
  userId: string;
  status: string;
  createdAt: string;
  userName?: string;
}

interface TeamMember {
  userId: string;
  role: string;
  displayName?: string;
}

interface Community {
  id: string;
  name: string;
  csMode: string | null;
  verified: boolean;
}

export default function OfficialDashboardPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const communityId = params.id as string;

  const [tab, setTab] = useState<DashTab>("queue");
  const [community, setCommunity] = useState<Community | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [stats, setStats] = useState<{ total: number; active: number; resolved: number; avgTime: string }>({ total: 0, active: 0, resolved: 0, avgTime: "-" });
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [commData, queueData] = await Promise.all([
        api<{ community: Community }>(`/api/communities/${communityId}`),
        api<{ queue: QueueItem[] }>(`/api/communities/${communityId}/cs-queue`),
      ]);
      setCommunity(commData.community);
      setQueue(queueData.queue);

      // Derive stats from queue
      const total = queueData.queue.length;
      const active = queueData.queue.filter((q: QueueItem) => q.status === "human_active" || q.status === "ai_active").length;
      const resolved = queueData.queue.filter((q: QueueItem) => q.status === "resolved").length;
      setStats({ total, active, resolved, avgTime: "-" });

      // Fetch team
      const teamData = await api<{ members: TeamMember[] }>(`/api/communities/${communityId}/members?role=cs_agent`, { silent: true }).catch(() => ({ members: [] }));
      setTeam(teamData.members);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAccept = async (conversationId: string) => {
    try {
      await api(`/api/communities/${communityId}/accept-transfer`, {
        method: "POST",
        body: JSON.stringify({ conversationId }),
      });
      fetchData();
    } catch {}
  };

  const handleResolve = async (conversationId: string) => {
    try {
      await api(`/api/communities/${communityId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ conversationId }),
      });
      fetchData();
    } catch {}
  };

  const handleInviteCs = async () => {
    if (!inviteEmail.trim()) return;
    try {
      await api(`/api/communities/${communityId}/invite-cs`, {
        method: "POST",
        body: JSON.stringify({ userId: inviteEmail.trim() }),
      });
      setInviteEmail("");
      fetchData();
    } catch {}
  };

  const handleUpdateCsMode = async (mode: string) => {
    try {
      await api(`/api/communities/${communityId}`, {
        method: "PUT",
        body: JSON.stringify({ csMode: mode }),
      });
      setCommunity((c) => c ? { ...c, csMode: mode } : c);
    } catch {}
  };

  const tabs: { id: DashTab; icon: typeof Headset; label: string }[] = [
    { id: "queue", icon: Headset, label: t("official.dashboard.queue") },
    { id: "team", icon: Users, label: t("official.dashboard.team") },
    { id: "stats", icon: BarChart3, label: t("official.dashboard.stats") },
    { id: "settings", icon: Settings, label: t("official.dashboard.settings") },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold truncate">{community?.name ?? "..."}</h1>
          <p className="text-xs text-muted-foreground">{t("official.dashboard.title")}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchData} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-2">
        {tabs.map((tb) => {
          const Icon = tb.icon;
          return (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                tab === tb.id ? "bg-blue-600 text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tb.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-3">
        {tab === "queue" && (
          <div className="flex flex-col gap-2">
            {queue.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("official.dashboard.emptyQueue")}</p>
            ) : (
              queue.map((item) => (
                <div key={item.conversationId} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.userName ?? item.userId}</p>
                    <p className={cn(
                      "text-xs",
                      item.status === "waiting_human" && "text-yellow-500",
                      item.status === "human_active" && "text-green-500",
                      item.status === "ai_active" && "text-blue-500",
                      item.status === "resolved" && "text-muted-foreground",
                    )}>
                      {t(`community.cs.status.${item.status}`)}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {item.status === "waiting_human" && (
                      <Button size="sm" variant="default" onClick={() => handleAccept(item.conversationId)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        {t("official.dashboard.accept")}
                      </Button>
                    )}
                    {(item.status === "human_active" || item.status === "ai_active") && (
                      <Button size="sm" variant="outline" onClick={() => handleResolve(item.conversationId)}>
                        <Clock className="h-3.5 w-3.5 mr-1" />
                        {t("official.dashboard.resolve")}
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "team" && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={t("official.dashboard.invitePlaceholder")}
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              <Button size="sm" onClick={handleInviteCs}>
                <UserPlus className="h-4 w-4 mr-1" />
                {t("official.dashboard.invite")}
              </Button>
            </div>
            {team.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("official.dashboard.noTeam")}</p>
            ) : (
              team.map((m) => (
                <div key={m.userId} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.displayName ?? m.userId}</p>
                    <p className="text-xs text-muted-foreground">{m.role}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "stats" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label={t("official.dashboard.totalConversations")} value={stats.total} />
            <StatCard label={t("official.dashboard.activeNow")} value={stats.active} />
            <StatCard label={t("official.dashboard.resolved")} value={stats.resolved} />
          </div>
        )}

        {tab === "settings" && community && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium">{t("community.form.csMode")}</label>
              <div className="flex gap-2">
                {(["ai_only", "human_only", "hybrid"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleUpdateCsMode(mode)}
                    className={cn(
                      "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                      community.csMode === mode
                        ? "bg-blue-600 text-white"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t(`community.csMode.${mode}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
