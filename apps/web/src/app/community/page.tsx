"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Plus, Users, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommunityItem {
  id: string;
  creatorId: string;
  name: string;
  description: string | null;
  type: "lounge" | "hub";
  joinFee: number;
  monthlyFee: number;
  agentCallFee: number;
  memberCount: number;
  avatarUrl: string | null;
  category: string | null;
  tags: string[] | null;
  createdAt: string;
  creatorName?: string;
}

interface BrowseResponse {
  communities: CommunityItem[];
  total: number;
}

const TYPE_FILTERS = ["all", "lounge", "hub"] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

const TABS = ["browse", "my", "joined"] as const;
type Tab = (typeof TABS)[number];

function CommunityBrowseContent() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("browse");
  const [communities, setCommunities] = useState<CommunityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchCommunities = useCallback(
    async (currentOffset: number) => {
      setLoading(true);
      try {
        let data: BrowseResponse;

        if (tab === "my") {
          const res = await api<{ communities: CommunityItem[] }>(
            "/api/communities/my"
          );
          data = { communities: res.communities, total: res.communities.length };
        } else if (tab === "joined") {
          const res = await api<{ communities: CommunityItem[] }>(
            "/api/communities/joined"
          );
          data = { communities: res.communities, total: res.communities.length };
        } else {
          const params = new URLSearchParams();
          if (typeFilter !== "all") params.set("type", typeFilter);
          if (search.trim()) params.set("search", search.trim());
          params.set("page", String(Math.floor(currentOffset / limit) + 1));
          params.set("limit", String(limit));
          data = await api<BrowseResponse>(
            `/api/communities?${params.toString()}`
          );
        }

        if (currentOffset === 0) {
          setCommunities(data.communities);
        } else {
          setCommunities((prev) => [...prev, ...data.communities]);
        }
        setTotal(data.total);
      } catch {
        // auto-handled by api()
      } finally {
        setLoading(false);
      }
    },
    [tab, typeFilter, search, limit]
  );

  // Debounced fetch on filter changes
  useEffect(() => {
    setOffset(0);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchCommunities(0);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [tab, typeFilter, search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Non-debounced fetch for load more
  useEffect(() => {
    if (offset > 0) {
      fetchCommunities(offset);
    }
  }, [offset]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-dvh bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-lg font-bold">Community</h1>
            <Button
              size="sm"
              className="brand-gradient-btn gap-1"
              onClick={() => router.push("/community/create")}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Create</span>
            </Button>
          </div>

          {/* Tabs */}
          <div className="mt-3 flex gap-1">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  tab === t
                    ? "bg-brand text-white"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "my" ? "My Communities" : t === "joined" ? "Joined" : "Browse"}
              </button>
            ))}
          </div>

          {/* Search + type filter (browse tab only) */}
          {tab === "browse" && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search communities..."
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="flex gap-1">
                {TYPE_FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setTypeFilter(f)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                      typeFilter === f
                        ? "bg-brand text-white"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Card grid */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && communities.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : communities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <Users className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm font-medium">No communities found</p>
              <p className="text-xs mt-1">
                {tab === "browse"
                  ? "Try adjusting your search or filters"
                  : tab === "my"
                  ? "You haven't created any communities yet"
                  : "You haven't joined any communities yet"}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {communities.map((c) => (
                  <CommunityCard
                    key={c.id}
                    community={c}
                    onClick={() => router.push(`/community/${c.id}`)}
                  />
                ))}
              </div>

              {/* Load more */}
              {tab === "browse" && communities.length < total && (
                <div className="mt-6 flex justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setOffset((o) => o + limit)}
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Load More"
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

function CommunityCard({
  community: c,
  onClick,
}: {
  community: CommunityItem;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-brand/40 hover:bg-card/80"
    >
      <div className="flex items-start gap-3">
        {c.avatarUrl ? (
          <img
            src={c.avatarUrl}
            alt={c.name}
            className="h-10 w-10 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/15 text-sm font-bold text-brand-text shrink-0">
            {c.name[0]}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{c.name}</h3>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                c.type === "lounge"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-purple-500/15 text-purple-400"
              )}
            >
              {c.type === "lounge" ? "Lounge" : "Hub"}
            </span>
          </div>
          {c.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
              {c.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {c.memberCount.toLocaleString()}
        </span>
        <span className="flex items-center gap-1">
          <Coins className="h-3 w-3 text-yellow-500" />
          {c.monthlyFee > 0
            ? `${c.monthlyFee}/mo`
            : c.joinFee > 0
            ? `${c.joinFee} join`
            : "Free"}
        </span>
        {c.creatorName && (
          <span className="ml-auto truncate">by {c.creatorName}</span>
        )}
      </div>
    </button>
  );
}

export default function CommunityPage() {
  return (
    <AuthGuard>
      <CommunityBrowseContent />
    </AuthGuard>
  );
}
