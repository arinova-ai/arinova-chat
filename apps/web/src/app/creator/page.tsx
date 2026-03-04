"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import { useTranslation } from "@/lib/i18n";
import { ArinovaSpinner } from "@/components/ui/arinova-spinner";
import {
  Loader2,
  Plus,
  Pencil,
  Archive,
  Coins,
  MessageSquare,
  Users,
  Star,
  ArrowDownCircle,
  Banknote,
  X,
  Download,
  Sticker,
  Bot,
  Palette,
  LayoutDashboard,
  Gamepad2,
  Users2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types (existing)
// ---------------------------------------------------------------------------

interface DashboardStats {
  totalRevenue: number;
  totalDownloads: number;
  totalUsers: number;
  avgRating: number;
  totalReviews: number;
  creations: {
    stickerPacks: number;
    agents: number;
    themes: number;
    communities: number;
    spaces: number;
  };
  recentEarnings: {
    id: string;
    amount: number;
    description: string | null;
    source: string;
    createdAt: string;
  }[];
}

interface AgentListing {
  id: string;
  agentName: string;
  description: string;
  avatarUrl: string | null;
  category: string;
  status: string;
  pricePerMessage: number;
  salesCount: number;
  totalMessages: number;
  totalRevenue: number;
  avgRating: number | null;
  reviewCount: number;
}

interface CreatorStickerPack {
  id: string;
  name: string;
  downloads: number;
  price: number;
  status: string;
  stickerCount: number;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Tab = "overview" | "stickers" | "agents" | "themes" | "community" | "spaces";

const TAB_DEFS: { key: Tab; i18nKey: string; icon: typeof LayoutDashboard }[] = [
  { key: "overview", i18nKey: "creator.tab.overview", icon: LayoutDashboard },
  { key: "stickers", i18nKey: "creator.tab.stickers", icon: Sticker },
  { key: "agents", i18nKey: "creator.tab.agents", icon: Bot },
  { key: "themes", i18nKey: "creator.tab.themes", icon: Palette },
  { key: "community", i18nKey: "creator.tab.community", icon: Users },
  { key: "spaces", i18nKey: "creator.tab.spaces", icon: Gamepad2 },
];

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: "bg-green-500/15 text-green-400",
    draft: "bg-yellow-500/15 text-yellow-400",
    archived: "bg-gray-500/15 text-gray-400",
    pending_review: "bg-blue-500/15 text-blue-400",
    under_review: "bg-blue-500/15 text-blue-400",
    suspended: "bg-red-500/15 text-red-400",
  };
  return map[status] ?? "bg-gray-500/15 text-gray-400";
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab({ stats, t }: { stats: DashboardStats | null; t: (k: string) => string }) {
  const router = useRouter();

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => router.push("/creator/revenue")}
          className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent/40 cursor-pointer"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Coins className="h-4 w-4 text-green-400" />
            <span className="text-xs">{t("creator.totalRevenue")}</span>
          </div>
          <p className="mt-1 text-2xl font-bold">{(stats?.totalRevenue ?? 0).toLocaleString()}</p>
        </button>
        <button
          type="button"
          onClick={() => router.push("/creator/downloads")}
          className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent/40 cursor-pointer"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Download className="h-4 w-4 text-blue-400" />
            <span className="text-xs">{t("creator.totalDownloads")}</span>
          </div>
          <p className="mt-1 text-2xl font-bold">{(stats?.totalDownloads ?? 0).toLocaleString()}</p>
        </button>
        <button
          type="button"
          onClick={() => router.push("/creator/users")}
          className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent/40 cursor-pointer"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4 text-green-400" />
            <span className="text-xs">{t("creator.totalUsers")}</span>
          </div>
          <p className="mt-1 text-2xl font-bold">{(stats?.totalUsers ?? 0).toLocaleString()}</p>
        </button>
        <button
          type="button"
          onClick={() => router.push("/creator/ratings")}
          className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent/40 cursor-pointer"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Star className="h-4 w-4 text-yellow-500" />
            <span className="text-xs">{t("creator.avgRating")}</span>
          </div>
          <p className="mt-1 text-2xl font-bold">{stats?.avgRating ?? 0}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {stats?.totalReviews ?? 0} {t("creator.ratings")}
          </p>
        </button>
      </div>

      {/* Your Creations */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t("creator.yourCreations")}
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <Sticker className="mx-auto h-6 w-6 text-brand-text" />
            <p className="mt-2 text-2xl font-bold">{stats?.creations.stickerPacks ?? 0}</p>
            <p className="text-xs text-muted-foreground">{t("creator.stickerPacks")}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <Bot className="mx-auto h-6 w-6 text-brand-text" />
            <p className="mt-2 text-2xl font-bold">{stats?.creations.agents ?? 0}</p>
            <p className="text-xs text-muted-foreground">{t("creator.tab.agents")}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <Palette className="mx-auto h-6 w-6 text-brand-text" />
            <p className="mt-2 text-2xl font-bold">{stats?.creations.themes ?? 0}</p>
            <p className="text-xs text-muted-foreground">{t("creator.tab.themes")}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <Users className="mx-auto h-6 w-6 text-brand-text" />
            <p className="mt-2 text-2xl font-bold">{stats?.creations.communities ?? 0}</p>
            <p className="text-xs text-muted-foreground">{t("creator.tab.community")}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <Gamepad2 className="mx-auto h-6 w-6 text-brand-text" />
            <p className="mt-2 text-2xl font-bold">{stats?.creations.spaces ?? 0}</p>
            <p className="text-xs text-muted-foreground">{t("creator.tab.spaces")}</p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t("creator.recentActivity")}
        </h2>
        {(stats?.recentEarnings.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">{t("creator.noActivity")}</p>
        ) : (
          <div className="space-y-2">
            {stats!.recentEarnings.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
              >
                <Coins className="h-4 w-4 shrink-0 text-green-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{e.description ?? e.source}</p>
                  <p className="text-[10px] text-muted-foreground">{e.source}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-green-400">
                  +{e.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stickers Tab
// ---------------------------------------------------------------------------

function StickersTab({ t }: { t: (k: string) => string }) {
  const router = useRouter();
  const [stickerPacks, setStickerPacks] = useState<CreatorStickerPack[]>([]);
  const [sLoading, setSLoading] = useState(true);

  useEffect(() => {
    setSLoading(true);
    api<{ packs: Array<{ id: string; name: string; downloads: number; price: number; status: string; stickerCount: number }> }>("/api/creator/stickers")
      .then((data) => setStickerPacks(data.packs))
      .catch(() => {})
      .finally(() => setSLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t("creator.yourStickerPacks")} ({stickerPacks.length})
        </h2>
        <Button size="sm" variant="secondary" className="gap-1" onClick={() => router.push("/creator/stickers")}>
          <Plus className="h-3.5 w-3.5" />
          {t("creator.newStickerPack")}
        </Button>
      </div>
      {sLoading ? (
        <div className="flex h-20 items-center justify-center">
          <ArinovaSpinner size="sm" />
        </div>
      ) : (
        <div className="space-y-2">
          {stickerPacks.map((pack) => (
            <div
              key={pack.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/15">
                <Sticker className="h-5 w-5 text-brand-text" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold truncate">{pack.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge(pack.status)}`}>
                    {t(`creator.status.${pack.status}`)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{pack.downloads.toLocaleString()} {t("creator.sales")}</span>
                  <span className="flex items-center gap-0.5">
                    <Coins className="h-3 w-3 text-yellow-500" />
                    {pack.stickerCount} stickers
                  </span>
                  <span className="flex items-center gap-0.5">
                    {pack.price === 0 ? t("stickerShop.free") : `${pack.price} coins`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agents Tab (preserved from existing code)
// ---------------------------------------------------------------------------

function AgentsTab({
  agents,
  loading,
  onArchive,
  t,
}: {
  agents: AgentListing[];
  loading: boolean;
  onArchive: (id: string) => void;
  t: (k: string) => string;
}) {
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <ArinovaSpinner size="sm" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t("creator.yourAgents")} ({agents.length})
        </h2>
        <Button
          size="sm"
          className="brand-gradient-btn gap-1"
          onClick={() => router.push("/creator/new")}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("creator.newAgent")}
        </Button>
      </div>
      {agents.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground opacity-40" />
          <p className="mt-2 text-sm text-muted-foreground">{t("creator.noAgents")}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3 gap-1"
            onClick={() => router.push("/creator/new")}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("creator.createFirstAgent")}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
            >
              {agent.avatarUrl ? (
                <img
                  src={agent.avatarUrl}
                  alt={agent.agentName}
                  className="h-10 w-10 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-sm font-bold text-brand-text">
                  {agent.agentName[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold truncate">{agent.agentName}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge(agent.status)}`}>
                    {t(`creator.status.${agent.status}`)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{agent.salesCount} {t("creator.chats")}</span>
                  <span>{agent.totalMessages} {t("creator.msgs")}</span>
                  <span className="flex items-center gap-0.5">
                    <Coins className="h-3 w-3 text-yellow-500" />
                    {agent.totalRevenue}
                  </span>
                  {agent.avgRating !== null && (
                    <span className="flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                      {agent.avgRating.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => router.push(`/creator/${agent.id}/edit`)}
                  title={t("creator.edit")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {agent.status !== "archived" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onArchive(agent.id)}
                    title={t("creator.archive")}
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Themes Tab
// ---------------------------------------------------------------------------

interface ThemeListing {
  id: string;
  name: string;
  version: string;
}

function ThemesTab({ t }: { t: (k: string) => string }) {
  const [themes, setThemes] = useState<ThemeListing[]>([]);
  const [tLoading, setTLoading] = useState(true);

  useEffect(() => {
    setTLoading(true);
    api<{ themes: ThemeListing[] }>("/api/themes")
      .then((data) => setThemes(data.themes))
      .catch(() => {})
      .finally(() => setTLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t("creator.yourThemes")} ({themes.length})
        </h2>
        <Button size="sm" variant="secondary" className="gap-1" disabled>
          <Plus className="h-3.5 w-3.5" />
          {t("creator.newTheme")}
        </Button>
      </div>
      {tLoading ? (
        <div className="flex h-20 items-center justify-center">
          <ArinovaSpinner size="sm" />
        </div>
      ) : themes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Palette className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">{t("creator.noThemes")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {themes.map((theme) => (
            <div
              key={theme.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/15">
                <Palette className="h-5 w-5 text-brand-text" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold truncate">{theme.name}</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">v{theme.version}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Community Tab
// ---------------------------------------------------------------------------

interface CreatorCommunity {
  id: string;
  name: string;
  memberCount: number;
  monthlyRevenue: number;
  status: string;
}

function CommunityTab({ t }: { t: (k: string) => string }) {
  const [communities, setCommunities] = useState<CreatorCommunity[]>([]);
  const [cLoading, setCLoading] = useState(true);

  useEffect(() => {
    setCLoading(true);
    api<{ communities: CreatorCommunity[] }>("/api/creator/community")
      .then((data) => setCommunities(data.communities))
      .catch(() => {})
      .finally(() => setCLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t("creator.yourCommunities")} ({communities.length})
        </h2>
      </div>
      {cLoading ? (
        <div className="flex h-20 items-center justify-center">
          <ArinovaSpinner size="sm" />
        </div>
      ) : communities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Users className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">{t("creator.noCommunities")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {communities.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/15">
                <Users className="h-5 w-5 text-brand-text" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold truncate">{c.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge(c.status)}`}>
                    {t(`creator.status.${c.status}`)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{c.memberCount} {t("creator.members")}</span>
                  <span className="flex items-center gap-0.5">
                    <Coins className="h-3 w-3 text-yellow-500" />
                    {c.monthlyRevenue}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spaces Tab
// ---------------------------------------------------------------------------

interface CreatorSpace {
  id: string;
  name: string;
  sessionCount: number;
  totalRevenue: number;
  status: string;
}

function SpacesTab({ t }: { t: (k: string) => string }) {
  const [spaces, setSpaces] = useState<CreatorSpace[]>([]);
  const [spLoading, setSpLoading] = useState(true);

  useEffect(() => {
    setSpLoading(true);
    api<{ spaces: CreatorSpace[] }>("/api/creator/spaces")
      .then((data) => setSpaces(data.spaces))
      .catch(() => {})
      .finally(() => setSpLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t("creator.yourSpaces")} ({spaces.length})
        </h2>
      </div>
      {spLoading ? (
        <div className="flex h-20 items-center justify-center">
          <ArinovaSpinner size="sm" />
        </div>
      ) : spaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Gamepad2 className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">{t("creator.noSpaces")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {spaces.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/15">
                <Gamepad2 className="h-5 w-5 text-brand-text" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold truncate">{s.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge(s.status)}`}>
                    {t(`creator.status.${s.status}`)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{s.sessionCount} sessions</span>
                  <span className="flex items-center gap-0.5">
                    <Coins className="h-3 w-3 text-yellow-500" />
                    {s.totalRevenue}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function CreatorConsoleContent() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("overview");
  const [agents, setAgents] = useState<AgentListing[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutLoading, setPayoutLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [agentData, balData, dashData] = await Promise.all([
        api<{ listings: AgentListing[] }>("/api/creator/agents"),
        api<{ balance: number }>("/api/wallet/balance"),
        api<DashboardStats>("/api/creator/dashboard"),
      ]);
      setAgents(agentData.listings);
      setBalance(balData.balance);
      setDashboardStats(dashData);
    } catch {
      // auto-handled
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleArchive = async (agentId: string) => {
    try {
      await api(`/api/agent-hub/agents/${agentId}`, { method: "DELETE" });
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, status: "archived" } : a)),
      );
    } catch {
      // auto-handled
    }
  };

  const handlePayout = async () => {
    const amount = parseInt(payoutAmount);
    if (!amount || amount < 100) return;
    setPayoutLoading(true);
    try {
      const result = await api<{ newBalance: number }>("/api/creator/payout", {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      setBalance(result.newBalance);
      setPayoutOpen(false);
      setPayoutAmount("");
    } catch {
      // auto-handled
    } finally {
      setPayoutLoading(false);
    }
  };

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <PageTitle
              icon={LayoutDashboard}
              title={t("creator.title")}
              subtitle={t("creator.subtitle")}
              className="flex-1"
            />
            <Button
              size="sm"
              variant="secondary"
              className="gap-1"
              onClick={() => setPayoutOpen(true)}
            >
              <Banknote className="h-4 w-4" />
              <span className="hidden sm:inline">{t("creator.payout")}</span>
            </Button>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex gap-1 overflow-x-auto">
            {TAB_DEFS.map((td) => (
              <button
                key={td.key}
                onClick={() => setTab(td.key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  tab === td.key
                    ? "bg-brand/15 text-brand-text"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <td.icon className="h-3.5 w-3.5" />
                {t(td.i18nKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 pb-24 md:pb-6">
          <div className="mx-auto max-w-4xl">
            {tab === "overview" && <OverviewTab stats={dashboardStats} t={t} />}
            {tab === "stickers" && <StickersTab t={t} />}
            {tab === "agents" && (
              <AgentsTab agents={agents} loading={loading} onArchive={handleArchive} t={t} />
            )}
            {tab === "themes" && <ThemesTab t={t} />}
            {tab === "community" && <CommunityTab t={t} />}
            {tab === "spaces" && <SpacesTab t={t} />}
          </div>
        </div>

        <MobileBottomNav />
      </div>

      {/* Payout dialog */}
      {payoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{t("creator.requestPayout")}</h3>
              <button
                onClick={() => setPayoutOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-lg bg-secondary p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("creator.availableBalance")}</p>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-2xl font-bold">
                <Coins className="h-5 w-5 text-yellow-500" />
                {balance.toLocaleString()}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("creator.payoutAmount")}</label>
              <input
                type="number"
                min={100}
                max={balance}
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value)}
                placeholder="100"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setPayoutOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="brand-gradient-btn flex-1"
                disabled={
                  payoutLoading ||
                  !payoutAmount ||
                  parseInt(payoutAmount) < 100 ||
                  parseInt(payoutAmount) > balance
                }
                onClick={handlePayout}
              >
                {payoutLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("creator.confirmPayout")
                )}
              </Button>
            </div>

            <p className="text-[10px] text-center text-muted-foreground">
              {t("creator.payoutNote")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CreatorConsolePage() {
  return (
    <AuthGuard>
      <CreatorConsoleContent />
    </AuthGuard>
  );
}
