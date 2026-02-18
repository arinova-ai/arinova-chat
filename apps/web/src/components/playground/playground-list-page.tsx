"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlaygroundStore } from "@/store/playground-store";
import { PlaygroundCard, CATEGORY_CONFIG } from "./playground-card";
import { CoinBalance } from "./coin-balance";
import type { PlaygroundCategory, PlaygroundDefinition } from "@arinova/shared/types";
import { cn } from "@/lib/utils";

const CATEGORIES: (PlaygroundCategory | null)[] = [
  null,
  "game",
  "strategy",
  "social",
  "puzzle",
  "roleplay",
  "other",
];

export function PlaygroundListPage() {
  const router = useRouter();
  const {
    playgrounds,
    playgroundsLoading,
    searchQuery,
    categoryFilter,
    loadPlaygrounds,
    setSearchQuery,
    setCategoryFilter,
    templates,
    templatesLoading,
    loadTemplates,
    deployTemplate,
  } = usePlaygroundStore();

  useEffect(() => {
    loadPlaygrounds(1);
    loadTemplates();
  }, [loadPlaygrounds, loadTemplates]);

  const handleSearch = useCallback(() => {
    loadPlaygrounds(1);
  }, [loadPlaygrounds]);

  const handleCategoryChange = useCallback(
    (cat: PlaygroundCategory | null) => {
      setCategoryFilter(cat);
      // Trigger reload after filter change
      setTimeout(() => loadPlaygrounds(1), 0);
    },
    [setCategoryFilter, loadPlaygrounds],
  );

  const handleDeploy = useCallback(
    async (slug: string) => {
      const pg = await deployTemplate(slug);
      router.push(`/playground/${pg.id}`);
    },
    [deployTemplate, router],
  );

  return (
    <div className="app-dvh overflow-y-auto bg-background">
      <div className="mx-auto max-w-4xl px-4 pb-[max(2rem,env(safe-area-inset-bottom,2rem))] pt-[max(1.25rem,env(safe-area-inset-top,1.25rem))]">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Playground</h1>
          <div className="ml-auto">
            <CoinBalance />
          </div>
        </div>

        {/* Templates */}
        {templates.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Quick Start
            </h2>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <Button
                  key={t.slug}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={templatesLoading}
                  onClick={() => handleDeploy(t.slug)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Search + Filter */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search playgrounds..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              className="pl-9 bg-neutral-800 border-none"
            />
          </div>
        </div>

        {/* Category pills */}
        <div className="mb-6 flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => {
            const active = categoryFilter === cat;
            const label = cat ? CATEGORY_CONFIG[cat].label : "All";
            return (
              <button
                key={cat ?? "all"}
                onClick={() => handleCategoryChange(cat)}
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-neutral-800 text-muted-foreground hover:bg-neutral-700",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Grid */}
        {playgroundsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : playgrounds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-muted-foreground">No playgrounds found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Deploy a template above to get started
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {playgrounds.map((pg) => {
              const def = pg.definition as PlaygroundDefinition;
              return (
                <PlaygroundCard
                  key={pg.id}
                  name={pg.name}
                  description={pg.description}
                  category={pg.category}
                  minPlayers={def.metadata.minPlayers}
                  maxPlayers={def.metadata.maxPlayers}
                  activeSessionStatus={pg.activeSession?.status}
                  activeParticipantCount={pg.activeSession?.participantCount}
                  onClick={() => router.push(`/playground/${pg.id}`)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
