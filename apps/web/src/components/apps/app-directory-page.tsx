"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import {
  Search,
  ExternalLink,
  Loader2,
  Package,
  Check,
  X,
} from "lucide-react";
import { IconRail } from "@/components/chat/icon-rail";

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

const CATEGORY_ICONS: Record<string, string> = {
  game: "\uD83C\uDFAE",
  strategy: "\u265F\uFE0F",
  social: "\uD83D\uDCAC",
  puzzle: "\uD83E\uDDE9",
  tool: "\uD83D\uDD27",
  other: "\uD83D\uDCE6",
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
    <div className="flex h-dvh bg-background">
      {/* Desktop Icon Rail */}
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-5">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Your Apps</h1>
            <div className="flex-1" />
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Search apps..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                className="h-9 w-64 rounded-lg border-none bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Button
              className="brand-gradient-btn gap-2"
              onClick={() => router.push("/developer")}
            >
              Browse More
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Mobile search */}
          <div className="mt-3 sm:hidden">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Search apps..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                className="h-9 w-full rounded-lg border-none bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Category pills */}
          <div className="mt-3 flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  category === cat
                    ? "bg-[oklch(0.55_0.2_250)] text-white"
                    : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
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
                {apps.map((app) => {
                  const isActive = app.status === "active" || app.status === "published";
                  return (
                    <div
                      key={app.id}
                      className="group relative flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-[oklch(0.4_0.1_250)] cursor-pointer"
                      onClick={() => router.push(`/apps/${app.id}`)}
                    >
                      {/* Icon + Name */}
                      <div className="flex items-start gap-3">
                        {app.iconUrl ? (
                          <img
                            src={app.iconUrl}
                            alt={app.name}
                            className="h-12 w-12 shrink-0 rounded-xl object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-lg">
                            {CATEGORY_ICONS[app.category.toLowerCase()] ?? "\uD83D\uDCE6"}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-base font-semibold">{app.name}</h3>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {app.description || "No description"}
                          </p>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="mt-4 flex items-center justify-between">
                        <Switch
                          checked={isActive}
                          aria-label={`Toggle ${app.name}`}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            isActive
                              ? "bg-green-500/15 text-green-400"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {isActive ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                          {isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
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
    </div>
  );
}
