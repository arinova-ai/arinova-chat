"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import { Loader2, Search, Plus, Users, Coins, BadgeCheck } from "lucide-react";
import { ArinovaSpinner } from "@/components/ui/arinova-spinner";

interface CommunityItem {
  id: string;
  creatorId: string;
  name: string;
  description: string | null;
  type: string;
  joinFee: number;
  monthlyFee: number;
  agentCallFee: number;
  memberCount: number;
  avatarUrl: string | null;
  category: string | null;
  tags: string[] | null;
  verified: boolean;
  csMode: string | null;
  createdAt: string;
  creatorName?: string;
}

interface BrowseResponse {
  communities: CommunityItem[];
  total: number;
}

function CommunityBrowseContent() {
  const router = useRouter();
  const { t } = useTranslation();
  const [communities, setCommunities] = useState<CommunityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchCommunities = useCallback(
    async (currentOffset: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("type", "community");
        if (search.trim()) params.set("search", search.trim());
        params.set("page", String(Math.floor(currentOffset / limit) + 1));
        params.set("limit", String(limit));
        const data = await api<BrowseResponse>(
          `/api/communities?${params.toString()}`
        );

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
    [search, limit]
  );

  useEffect(() => {
    setOffset(0);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchCommunities(0);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (offset > 0) {
      fetchCommunities(offset);
    }
  }, [offset]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <PageTitle icon={Users} title={t("community.title")} subtitle={t("community.subtitle")} />
            <Button
              size="sm"
              className="brand-gradient-btn gap-1"
              onClick={() => router.push("/community/create")}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{t("community.create")}</span>
            </Button>
          </div>

          {/* Search */}
          <div className="mt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("community.searchPlaceholder")}
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        {/* Card grid */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && communities.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <ArinovaSpinner />
            </div>
          ) : communities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <Users className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm font-medium">{t("community.notFound")}</p>
              <p className="text-xs mt-1">{t("community.notFoundHint")}</p>
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

              {communities.length < total && (
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
                      t("common.loadMore")
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
  const { t } = useTranslation();

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
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold truncate">{c.name}</h3>
            {c.verified && (
              <BadgeCheck className="h-4 w-4 shrink-0 text-blue-500" />
            )}
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
        {(c.monthlyFee > 0 || c.joinFee > 0) && (
          <span className="flex items-center gap-1">
            <Coins className="h-3 w-3 text-yellow-500" />
            {c.monthlyFee > 0
              ? `${c.monthlyFee}${t("community.perMonth")}`
              : `${c.joinFee} ${t("community.joinFee")}`}
          </span>
        )}
        {c.creatorName && (
          <span className="ml-auto truncate">{t("community.by")} {c.creatorName}</span>
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
