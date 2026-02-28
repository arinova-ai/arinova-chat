"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
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
  TrendingUp,
  ShoppingCart,
  CheckCircle,
  Sticker,
  Bot,
  Palette,
  LayoutDashboard,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types (existing)
// ---------------------------------------------------------------------------

interface DashboardStats {
  totalRevenue: number;
  totalMessages: number;
  totalConversations: number;
  activeListings: number;
  avgRating: number | null;
  totalReviews: number;
  recentEarnings: {
    id: string;
    amount: number;
    description: string | null;
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

// ---------------------------------------------------------------------------
// Mock data for Overview / Stickers / Themes tabs
// ---------------------------------------------------------------------------

const MOCK_CREATOR_STATS = {
  revenue: 128.50, revenueChange: 8.2,
  downloads: 4523, downloadsNew: 154,
  users: 4542, usersChange: 22,
  rating: 4.6, ratingCount: 89,
};

const MOCK_CREATIONS = { stickerPacks: 3, agents: 2, themes: 1 };

const MOCK_ACTIVITY = [
  { text: "Cute Animals Pack sold \u00d75", time: "2h ago", icon: "cart" as const },
  { text: "New review on Arinova Pack \u2605\u2605\u2605\u2605\u2606", time: "5h ago", icon: "star" as const },
  { text: 'Theme "Ocean Blue" approved', time: "1d ago", icon: "check" as const },
];

const MOCK_STICKER_LISTINGS = [
  { name: "Arinova Official", sales: 2300, revenue: 0, status: "active" },
  { name: "Cute Animals", sales: 1800, revenue: 90.00, status: "active" },
  { name: "Pixel Art", sales: 2100, revenue: 126.00, status: "under_review" },
];

const MOCK_THEME_LISTINGS = [
  { name: "Ocean Blue", sales: 450, revenue: 67.50, status: "active" },
];

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Tab = "overview" | "stickers" | "agents" | "themes";

const TABS: { key: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "stickers", label: "Stickers", icon: Sticker },
  { key: "agents", label: "Agents", icon: Bot },
  { key: "themes", label: "Themes", icon: Palette },
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

const ACTIVITY_ICONS = {
  cart: ShoppingCart,
  star: Star,
  check: CheckCircle,
};

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab() {
  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Coins className="h-4 w-4 text-green-400" />
            <span className="text-xs">Total Revenue</span>
          </div>
          <p className="mt-1 text-2xl font-bold">${MOCK_CREATOR_STATS.revenue.toFixed(2)}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-green-400">
            <TrendingUp className="h-3 w-3" />
            +{MOCK_CREATOR_STATS.revenueChange}% this week
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Download className="h-4 w-4 text-blue-400" />
            <span className="text-xs">Total Downloads</span>
          </div>
          <p className="mt-1 text-2xl font-bold">{MOCK_CREATOR_STATS.downloads.toLocaleString()}</p>
          <p className="mt-0.5 text-[11px] text-blue-400">
            +{MOCK_CREATOR_STATS.downloadsNew} new
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4 text-green-400" />
            <span className="text-xs">Total Users</span>
          </div>
          <p className="mt-1 text-2xl font-bold">{MOCK_CREATOR_STATS.users.toLocaleString()}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-green-400">
            <TrendingUp className="h-3 w-3" />
            +{MOCK_CREATOR_STATS.usersChange}% new
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Star className="h-4 w-4 text-yellow-500" />
            <span className="text-xs">Average Rating</span>
          </div>
          <p className="mt-1 text-2xl font-bold">{MOCK_CREATOR_STATS.rating}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Based on {MOCK_CREATOR_STATS.ratingCount} ratings
          </p>
        </div>
      </div>

      {/* Your Creations */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Your Creations
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <Sticker className="mx-auto h-6 w-6 text-brand-text" />
            <p className="mt-2 text-2xl font-bold">{MOCK_CREATIONS.stickerPacks}</p>
            <p className="text-xs text-muted-foreground">Sticker Packs</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <Bot className="mx-auto h-6 w-6 text-brand-text" />
            <p className="mt-2 text-2xl font-bold">{MOCK_CREATIONS.agents}</p>
            <p className="text-xs text-muted-foreground">Agents</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <Palette className="mx-auto h-6 w-6 text-brand-text" />
            <p className="mt-2 text-2xl font-bold">{MOCK_CREATIONS.themes}</p>
            <p className="text-xs text-muted-foreground">Themes</p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Recent Activity
        </h2>
        <div className="space-y-2">
          {MOCK_ACTIVITY.map((act, i) => {
            const Icon = ACTIVITY_ICONS[act.icon];
            const iconColor =
              act.icon === "cart" ? "text-green-400" :
              act.icon === "star" ? "text-yellow-500" :
              "text-blue-400";
            return (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
              >
                <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
                <p className="flex-1 min-w-0 text-sm truncate">{act.text}</p>
                <span className="shrink-0 text-xs text-muted-foreground">{act.time}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stickers Tab
// ---------------------------------------------------------------------------

function StickersTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Your Sticker Packs ({MOCK_STICKER_LISTINGS.length})
        </h2>
        <Button size="sm" variant="secondary" className="gap-1" disabled>
          <Plus className="h-3.5 w-3.5" />
          New Sticker Pack
        </Button>
      </div>
      <div className="space-y-2">
        {MOCK_STICKER_LISTINGS.map((pack) => (
          <div
            key={pack.name}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/15">
              <Sticker className="h-5 w-5 text-brand-text" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold truncate">{pack.name}</h3>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge(pack.status)}`}>
                  {pack.status.replace("_", " ")}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{pack.sales.toLocaleString()} sales</span>
                <span className="flex items-center gap-0.5">
                  <Coins className="h-3 w-3 text-yellow-500" />
                  ${pack.revenue.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
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
}: {
  agents: AgentListing[];
  loading: boolean;
  onArchive: (id: string) => void;
}) {
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Your Agents ({agents.length})
        </h2>
        <Button
          size="sm"
          className="brand-gradient-btn gap-1"
          onClick={() => router.push("/creator/new")}
        >
          <Plus className="h-3.5 w-3.5" />
          New Agent
        </Button>
      </div>
      {agents.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground opacity-40" />
          <p className="mt-2 text-sm text-muted-foreground">No agents yet</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3 gap-1"
            onClick={() => router.push("/creator/new")}
          >
            <Plus className="h-3.5 w-3.5" />
            Create Your First Agent
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
                    {agent.status}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{agent.salesCount} chats</span>
                  <span>{agent.totalMessages} msgs</span>
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
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {agent.status !== "archived" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onArchive(agent.id)}
                    title="Archive"
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

function ThemesTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Your Themes ({MOCK_THEME_LISTINGS.length})
        </h2>
        <Button size="sm" variant="secondary" className="gap-1" disabled>
          <Plus className="h-3.5 w-3.5" />
          New Theme
        </Button>
      </div>
      <div className="space-y-2">
        {MOCK_THEME_LISTINGS.map((theme) => (
          <div
            key={theme.name}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/15">
              <Palette className="h-5 w-5 text-brand-text" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold truncate">{theme.name}</h3>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge(theme.status)}`}>
                  {theme.status}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{theme.sales.toLocaleString()} sales</span>
                <span className="flex items-center gap-0.5">
                  <Coins className="h-3 w-3 text-yellow-500" />
                  ${theme.revenue.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function CreatorConsoleContent() {
  const [tab, setTab] = useState<Tab>("overview");
  const [agents, setAgents] = useState<AgentListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutLoading, setPayoutLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [agentData, balData] = await Promise.all([
        api<{ listings: AgentListing[] }>("/api/creator/agents"),
        api<{ balance: number }>("/api/wallet/balance"),
      ]);
      setAgents(agentData.listings);
      setBalance(balData.balance);
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
      await api(`/api/marketplace/agents/${agentId}`, { method: "DELETE" });
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
              title="Creator Console"
              subtitle="Manage your creations"
              className="flex-1"
            />
            <Button
              size="sm"
              variant="secondary"
              className="gap-1"
              onClick={() => setPayoutOpen(true)}
            >
              <Banknote className="h-4 w-4" />
              <span className="hidden sm:inline">Payout</span>
            </Button>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  tab === t.key
                    ? "bg-brand/15 text-brand-text"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 pb-24 md:pb-6">
          <div className="mx-auto max-w-4xl">
            {tab === "overview" && <OverviewTab />}
            {tab === "stickers" && <StickersTab />}
            {tab === "agents" && (
              <AgentsTab agents={agents} loading={loading} onArchive={handleArchive} />
            )}
            {tab === "themes" && <ThemesTab />}
          </div>
        </div>

        <MobileBottomNav />
      </div>

      {/* Payout dialog */}
      {payoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Request Payout</h3>
              <button
                onClick={() => setPayoutOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-lg bg-secondary p-3 text-center">
              <p className="text-xs text-muted-foreground">Available Balance</p>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-2xl font-bold">
                <Coins className="h-5 w-5 text-yellow-500" />
                {balance.toLocaleString()}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Amount (min 100)</label>
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
                Cancel
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
                  "Confirm Payout"
                )}
              </Button>
            </div>

            <p className="text-[10px] text-center text-muted-foreground">
              Payout requests are processed within 3-5 business days.
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
