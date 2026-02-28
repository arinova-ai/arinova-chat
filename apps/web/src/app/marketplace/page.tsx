"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import { Search, Loader2, Star, Store, MessageSquare, Coins, Plus } from "lucide-react";
import { PageTitle } from "@/components/ui/page-title";

interface AgentListing {
  id: string;
  agentName: string;
  description: string;
  avatarUrl: string | null;
  category: string;
  model: string;
  pricePerMessage: number;
  freeTrialMessages: number;
  salesCount: number;
  totalMessages: number;
  avgRating: number | null;
  reviewCount: number;
}

interface BrowseResponse {
  listings: AgentListing[];
  total: number;
}

const CATEGORIES = [
  "All",
  "Productivity",
  "Development",
  "Education",
  "Creative",
  "Analytics",
  "Support",
  "Other",
];

const SORTS = [
  { value: "popular", label: "Popular" },
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Rating" },
  { value: "price", label: "Price" },
];

function MarketplaceContent() {
  const router = useRouter();
  const [listings, setListings] = useState<AgentListing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("popular");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const fetchListings = useCallback(async (currentOffset: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category !== "All") params.set("category", category.toLowerCase());
      if (search.trim()) params.set("search", search.trim());
      params.set("sort", sort);
      params.set("limit", String(limit));
      params.set("offset", String(currentOffset));

      const data = await api<BrowseResponse>(
        `/api/marketplace/agents?${params.toString()}`
      );
      setListings((prev) =>
        currentOffset === 0 ? data.listings : [...prev, ...data.listings]
      );
      setTotal(data.total);
    } catch {
      // auto-handled by api
    } finally {
      setLoading(false);
    }
  }, [category, search, sort]);

  // Debounced fetch on filter changes
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setOffset(0);
      fetchListings(0);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, category, sort, fetchListings]);

  // Load more (non-debounced)
  useEffect(() => {
    if (offset > 0) fetchListings(offset);
  }, [offset, fetchListings]);

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-5">
          <div className="flex items-center gap-4">
            <PageTitle
              title="Marketplace"
              subtitle="Agent Store"
              icon={Store}
            />
            <div className="flex-1" />
            <Button
              size="sm"
              className="brand-gradient-btn gap-1 hidden sm:flex"
              onClick={() => router.push("/creator/new")}
            >
              <Plus className="h-4 w-4" />
              Create Agent
            </Button>
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Search agents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
                className="h-9 w-64 rounded-lg border-none bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Mobile search */}
          <div className="mt-3 sm:hidden">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Search agents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
                className="h-9 w-full rounded-lg border-none bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Category pills + Sort */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex flex-1 flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setCategory(cat);
                    setOffset(0);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    category === cat
                      ? "bg-brand text-white"
                      : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setOffset(0);
              }}
              className="hidden h-8 rounded-lg border-none bg-secondary px-2 text-xs text-foreground sm:block focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 pb-24 md:pb-6">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : listings.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessageSquare className="h-10 w-10 opacity-40" />
              <p className="text-sm">No agents found</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {listings.map((agent) => (
                  <div
                    key={agent.id}
                    className="group relative flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-brand-border cursor-pointer"
                    onClick={() => router.push(`/marketplace/${agent.id}`)}
                  >
                    {/* Avatar + Name */}
                    <div className="flex items-start gap-3">
                      {agent.avatarUrl ? (
                        <img
                          src={agent.avatarUrl}
                          alt={agent.agentName}
                          className="h-12 w-12 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-lg font-bold text-brand-text">
                          {agent.agentName[0]}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-semibold">
                          {agent.agentName}
                        </h3>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {agent.description}
                        </p>
                      </div>
                    </div>

                    {/* Footer: price + rating + conversations */}
                    <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 font-medium text-foreground">
                        <Coins className="h-3.5 w-3.5 text-yellow-500" />
                        {agent.pricePerMessage === 0
                          ? "Free"
                          : `${agent.pricePerMessage}/msg`}
                      </span>
                      {agent.avgRating !== null && (
                        <span className="flex items-center gap-0.5">
                          <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                          {agent.avgRating.toFixed(1)}
                        </span>
                      )}
                      <span className="flex items-center gap-0.5 text-[10px]">
                        {agent.model.split("/").pop()}
                      </span>
                      {agent.freeTrialMessages > 0 && (
                        <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] text-green-400">
                          {agent.freeTrialMessages} free
                        </span>
                      )}
                      <span className="ml-auto">
                        {agent.salesCount} chats
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Load more */}
              {listings.length < total && (
                <div className="mt-8 flex justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setOffset((o) => o + limit)}
                  >
                    Load More
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

export default function MarketplacePage() {
  return (
    <AuthGuard>
      <MarketplaceContent />
    </AuthGuard>
  );
}
