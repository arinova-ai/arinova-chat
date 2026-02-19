"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSpacesStore } from "@/store/spaces-store";
import {
  ArrowLeft,
  Search,
  Loader2,
  Gamepad2,
  Users,
  Plus,
} from "lucide-react";

const CATEGORIES = [
  "All",
  "Game",
  "Strategy",
  "Social",
  "Puzzle",
  "Roleplay",
  "Other",
];

const CATEGORY_COLORS: Record<string, string> = {
  game: "bg-purple-500/20 text-purple-400",
  strategy: "bg-blue-500/20 text-blue-400",
  social: "bg-pink-500/20 text-pink-400",
  puzzle: "bg-amber-500/20 text-amber-400",
  roleplay: "bg-emerald-500/20 text-emerald-400",
  other: "bg-neutral-500/20 text-neutral-400",
};

export function SpacesListPage() {
  const router = useRouter();
  const {
    spaces,
    loading,
    page,
    totalPages,
    search,
    category,
    fetchSpaces,
    setSearch,
    setCategory,
    setPage,
  } = useSpacesStore();

  useEffect(() => {
    fetchSpaces();
  }, [category, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = useCallback(() => {
    setPage(1);
    fetchSpaces();
  }, [fetchSpaces, setPage]);

  const handleCategoryChange = useCallback(
    (cat: string) => {
      setCategory(cat);
    },
    [setCategory]
  );

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Gamepad2 className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Spaces</h1>
      </div>

      {/* Search + Filters */}
      <div className="shrink-0 space-y-3 border-b border-neutral-800 px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search spaces..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            className="pl-9 bg-neutral-800 border-none"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                category === cat
                  ? "bg-white text-black"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : spaces.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Gamepad2 className="h-10 w-10" />
            <p className="text-sm">No spaces found</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {spaces.map((space) => (
                <div
                  key={space.id}
                  onClick={() => router.push(`/spaces/${space.id}`)}
                  className="group flex cursor-pointer flex-col rounded-lg border border-neutral-800 bg-card p-4 transition-colors hover:border-neutral-700"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-800">
                      <Gamepad2 className="h-6 w-6 text-neutral-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold">{space.name}</h3>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {space.description || "No description"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        CATEGORY_COLORS[space.category?.toLowerCase()] ??
                        CATEGORY_COLORS.other
                      }`}
                    >
                      {space.category}
                    </span>
                    {space.tags && space.tags.length > 0 && (
                      <div className="flex gap-1">
                        {space.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => {
                    setPage(page - 1);
                  }}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => {
                    setPage(page + 1);
                  }}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
