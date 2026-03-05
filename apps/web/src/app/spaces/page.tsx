"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { PageTitle } from "@/components/ui/page-title";
import { Button } from "@/components/ui/button";
import { Search, Gamepad2, Play, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useSpacesStore } from "@/store/spaces-store";
import type { Space } from "@arinova/shared/types";

const CATEGORY_KEYS = ["all", "board_game", "card_game", "rpg", "strategy", "puzzle", "trivia", "social", "other"] as const;

const CATEGORY_COLORS: Record<string, string> = {
  board_game: "bg-red-500/15 text-red-400",
  card_game: "bg-amber-500/15 text-amber-400",
  rpg: "bg-orange-500/15 text-orange-400",
  strategy: "bg-teal-500/15 text-teal-400",
  puzzle: "bg-purple-500/15 text-purple-400",
  trivia: "bg-pink-500/15 text-pink-400",
  social: "bg-blue-500/15 text-blue-400",
  other: "bg-gray-500/15 text-gray-400",
};

// ---------------------------------------------------------------------------
// Space Card
// ---------------------------------------------------------------------------

function SpaceCard({ space, t }: { space: Space; t: (k: string) => string }) {
  const categoryClass = CATEGORY_COLORS[space.category] ?? "bg-gray-500/15 text-gray-400";

  return (
    <Link href={`/spaces/${space.id}`} className="flex flex-col rounded-xl border border-border bg-card transition-colors hover:border-brand-border">
      <div className="flex aspect-[4/3] items-center justify-center rounded-t-xl bg-secondary/50 text-4xl">
        🎮
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start gap-2">
          <h3 className="flex-1 text-sm font-semibold truncate">{space.name}</h3>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${categoryClass}`}>
            {t(`spaces.cat.${space.category}`)}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{space.description}</p>
        <div className="mt-auto pt-2.5 flex items-center justify-end">
          <Button size="sm" variant="secondary" className="h-7 gap-1 text-[11px] px-2.5">
            <Play className="h-3 w-3" />
            {t("spaces.play")}
          </Button>
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function SpacesContent() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const spaces = useSpacesStore((s) => s.spaces);
  const loading = useSpacesStore((s) => s.loading);
  const error = useSpacesStore((s) => s.error);
  const fetchSpaces = useSpacesStore((s) => s.fetchSpaces);

  useEffect(() => {
    fetchSpaces();
  }, [fetchSpaces]);

  const filtered = useMemo(() => {
    let list = spaces;
    if (category !== "all") {
      list = list.filter((s) => s.category === category);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q),
      );
    }
    return list;
  }, [spaces, category, search]);

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-5">
          <div className="flex items-center gap-4">
            <PageTitle title={t("spaces.title")} subtitle={t("spaces.subtitle")} icon={Gamepad2} />
          </div>

          {/* Search */}
          <div className="mt-3 relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder={t("spaces.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border-none bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Category pills */}
          <div className="mt-3 flex flex-wrap gap-2">
            {CATEGORY_KEYS.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  category === cat
                    ? "bg-brand text-white"
                    : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {t(`spaces.cat.${cat}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-6">
          <div className="mx-auto max-w-5xl space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <AlertTriangle className="h-10 w-10 opacity-40 mb-2" />
                <p className="text-sm font-medium">Failed to load. Try again</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3 gap-1.5"
                  onClick={() => fetchSpaces()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Gamepad2 className="h-10 w-10 opacity-40 mb-2" />
                <p className="text-sm">{t("spaces.noGames")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((space) => (
                  <SpaceCard key={space.id} space={space} t={t} />
                ))}
              </div>
            )}
          </div>
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function SpacesPage() {
  return (
    <AuthGuard>
      <SpacesContent />
    </AuthGuard>
  );
}
