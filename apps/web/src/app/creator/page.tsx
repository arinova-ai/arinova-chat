"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";

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
  name: string;
  description: string;
  avatarUrl: string | null;
  category: string;
  status: string;
  pricePerMessage: number;
  totalConversations: number;
  totalMessages: number;
  totalRevenue: number;
  avgRating: number | null;
  reviewCount: number;
}

function CreatorDashboardContent() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [agents, setAgents] = useState<AgentListing[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashData, agentData] = await Promise.all([
        api<DashboardStats>("/api/creator/dashboard"),
        api<AgentListing[]>("/api/creator/agents"),
      ]);
      setStats(dashData);
      setAgents(agentData);
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

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: "bg-green-500/15 text-green-400",
      draft: "bg-yellow-500/15 text-yellow-400",
      archived: "bg-gray-500/15 text-gray-400",
      pending_review: "bg-blue-500/15 text-blue-400",
      suspended: "bg-red-500/15 text-red-400",
    };
    return map[status] ?? "bg-gray-500/15 text-gray-400";
  };

  return (
    <div className="flex h-dvh bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/15">
              <Coins className="h-5 w-5 text-brand-text" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Creator Dashboard</h1>
              <p className="text-xs text-muted-foreground">
                Manage your AI agents
              </p>
            </div>
            <Button
              size="sm"
              className="brand-gradient-btn gap-1"
              onClick={() => router.push("/creator/new")}
            >
              <Plus className="h-4 w-4" />
              New Agent
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 pb-24 md:pb-6">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-8">
              {/* Stat cards */}
              {stats && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Coins className="h-4 w-4 text-yellow-500" />
                      <span className="text-xs">Revenue</span>
                    </div>
                    <p className="mt-1 text-2xl font-bold">
                      {stats.totalRevenue.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MessageSquare className="h-4 w-4" />
                      <span className="text-xs">Messages</span>
                    </div>
                    <p className="mt-1 text-2xl font-bold">
                      {stats.totalMessages.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span className="text-xs">Conversations</span>
                    </div>
                    <p className="mt-1 text-2xl font-bold">
                      {stats.totalConversations.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Star className="h-4 w-4 text-yellow-500" />
                      <span className="text-xs">Rating</span>
                    </div>
                    <p className="mt-1 text-2xl font-bold">
                      {stats.avgRating?.toFixed(1) ?? "—"}
                    </p>
                    {stats.totalReviews > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        {stats.totalReviews} reviews
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Agent list */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Your Agents ({agents.length})
                </h2>
                {agents.length === 0 ? (
                  <div className="rounded-xl border border-border bg-card p-8 text-center">
                    <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground opacity-40" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      No agents yet
                    </p>
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
                            alt={agent.name}
                            className="h-10 w-10 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-sm font-bold text-brand-text">
                            {agent.name[0]}
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold truncate">
                              {agent.name}
                            </h3>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge(agent.status)}`}
                            >
                              {agent.status}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span>{agent.totalConversations} chats</span>
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
                            onClick={() =>
                              router.push(`/creator/${agent.id}/edit`)
                            }
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {agent.status !== "archived" && (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => handleArchive(agent.id)}
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

              {/* Recent earnings */}
              {stats && stats.recentEarnings.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Recent Earnings
                  </h2>
                  <div className="space-y-2">
                    {stats.recentEarnings.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
                      >
                        <ArrowDownCircle className="h-5 w-5 shrink-0 text-green-400" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {tx.description || "Agent earning"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(tx.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-green-400">
                          +{tx.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function CreatorDashboardPage() {
  return (
    <AuthGuard>
      <CreatorDashboardContent />
    </AuthGuard>
  );
}
