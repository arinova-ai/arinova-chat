"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { PageTitle } from "@/components/ui/page-title";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ArinovaSpinner } from "@/components/ui/arinova-spinner";
import { Lightbulb, Search, Star, MessageCircle, Coins } from "lucide-react";
import { assetUrl } from "@/lib/config";

interface Expert {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  category: string;
  pricePerAsk: number;
  totalAsks: number;
  avgRating: number | null;
  freeTrialCount: number;
  ownerName: string;
  ownerImage: string | null;
  ownerUsername: string | null;
}

const CATEGORIES = ["all", "general", "tech", "business", "creative", "education", "health", "legal", "finance"];

function ExpertHubContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const [experts, setExperts] = useState<Expert[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<"popular" | "newest">("popular");

  const fetchExperts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("published_only", "true");
      if (search.trim()) params.set("search", search.trim());
      if (category !== "all") params.set("category", category);
      params.set("sort", sort);
      const data = await api<{ experts: Expert[] }>(`/api/expert-hub?${params}`);
      setExperts(data.experts);
    } catch {
      // api shows toast
    } finally {
      setLoading(false);
    }
  }, [search, category, sort]);

  useEffect(() => {
    const timer = setTimeout(fetchExperts, 300);
    return () => clearTimeout(timer);
  }, [fetchExperts]);

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-4 md:px-6 py-4">
          <PageTitle
            title={t("expertHub.title")}
            subtitle={t("expertHub.subtitle")}
            icon={Lightbulb}
          />
        </div>

        {/* Search + Filters */}
        <div className="shrink-0 border-b border-border px-4 md:px-6 py-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("expertHub.searchPlaceholder")}
              className="pl-9 h-10"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  category === cat
                    ? "bg-brand text-white"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {cat === "all" ? t("expertHub.allCategories") : cat}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSort("popular")}
              className={cn("text-xs font-medium", sort === "popular" ? "text-brand" : "text-muted-foreground")}
            >
              {t("expertHub.sortPopular")}
            </button>
            <button
              type="button"
              onClick={() => setSort("newest")}
              className={cn("text-xs font-medium", sort === "newest" ? "text-brand" : "text-muted-foreground")}
            >
              {t("expertHub.sortNewest")}
            </button>
          </div>
        </div>

        {/* Expert Grid */}
        <div className="flex-1 overflow-y-auto pb-24 md:pb-0 px-4 md:px-6 py-4">
          {loading ? (
            <div className="flex justify-center py-12"><ArinovaSpinner size="sm" /></div>
          ) : experts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Lightbulb className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{t("expertHub.empty")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {experts.map((expert) => (
                <button
                  key={expert.id}
                  type="button"
                  onClick={() => router.push(`/expert-hub/${expert.id}`)}
                  className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-brand-border"
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10 shrink-0">
                      {expert.avatarUrl ? <AvatarImage src={assetUrl(expert.avatarUrl)} /> : null}
                      <AvatarFallback className="bg-accent text-sm">{expert.name.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold truncate">{expert.name}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{expert.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-foreground">
                    <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">{expert.category}</span>
                    <span className="flex items-center gap-0.5"><Coins className="h-3 w-3" />{expert.pricePerAsk}</span>
                    <span className="flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{expert.totalAsks}</span>
                    {expert.avgRating != null && (
                      <span className="flex items-center gap-0.5"><Star className="h-3 w-3 text-yellow-500" />{expert.avgRating.toFixed(1)}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function ExpertHubPage() {
  return (
    <AuthGuard>
      <ExpertHubContent />
    </AuthGuard>
  );
}
