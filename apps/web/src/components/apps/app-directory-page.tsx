"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import {
  ArrowLeft,
  Search,
  Code2,
  ExternalLink,
  Loader2,
  Package,
} from "lucide-react";

interface App {
  id: string;
  name: string;
  description: string | null;
  category: string;
  externalUrl: string;
  iconUrl: string | null;
  status: string;
  developer?: { name: string } | null;
}

interface AppsResponse {
  apps: App[];
  total: number;
  page: number;
  totalPages: number;
}

const CATEGORIES = ["All", "Game", "Strategy", "Social", "Puzzle", "Tool", "Other"];

const CATEGORY_COLORS: Record<string, string> = {
  game: "bg-purple-500/20 text-purple-400",
  strategy: "bg-blue-500/20 text-blue-400",
  social: "bg-pink-500/20 text-pink-400",
  puzzle: "bg-amber-500/20 text-amber-400",
  tool: "bg-cyan-500/20 text-cyan-400",
  other: "bg-neutral-500/20 text-neutral-400",
};

export function AppDirectoryPage() {
  const router = useRouter();
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category !== "All") params.set("category", category.toLowerCase());
      if (search.trim()) params.set("search", search.trim());
      params.set("page", String(page));

      const data = await api<AppsResponse>(`/api/apps?${params.toString()}`);
      setApps(data.apps);
      setTotalPages(data.totalPages);
    } catch {
      // ApiError toast is auto-handled
    } finally {
      setLoading(false);
    }
  }, [category, search, page]);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const handleSearch = () => {
    setPage(1);
    fetchApps();
  };

  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    setPage(1);
  };

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
        <h1 className="text-lg font-semibold">Apps</h1>
        <div className="flex-1" />
        <Button
          variant="secondary"
          className="gap-2"
          onClick={() => router.push("/developer")}
        >
          <Code2 className="h-4 w-4" />
          Developer Console
        </Button>
      </div>

      {/* Search + Filters */}
      <div className="shrink-0 space-y-3 border-b border-neutral-800 px-4 py-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search apps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            className="pl-9 bg-neutral-800 border-none"
          />
        </div>

        {/* Category pills */}
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
        ) : apps.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Package className="h-10 w-10" />
            <p className="text-sm">No apps found</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {apps.map((app) => (
                <div
                  key={app.id}
                  className="group flex flex-col rounded-lg border border-neutral-800 bg-card p-4 transition-colors hover:border-neutral-700"
                >
                  {/* Icon + Info */}
                  <div className="flex items-start gap-3">
                    {app.iconUrl ? (
                      <img
                        src={app.iconUrl}
                        alt={app.name}
                        className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-800">
                        <Package className="h-6 w-6 text-neutral-500" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold">{app.name}</h3>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {app.description || "No description"}
                      </p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-3 flex items-center justify-between">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        CATEGORY_COLORS[app.category.toLowerCase()] ??
                        CATEGORY_COLORS.other
                      }`}
                    >
                      {app.category}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => router.push(`/apps/${app.id}`)}
                      >
                        Details
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => window.open(app.externalUrl, "_blank")}
                      >
                        <ExternalLink className="h-3 w-3" />
                        Play
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
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
                  onClick={() => setPage((p) => p + 1)}
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
