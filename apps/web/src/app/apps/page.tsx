"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Search, Package, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type AppCategory = "All" | "Game" | "Shopping" | "Tool" | "Social" | "Other";

interface MarketplaceApp {
  id: string;
  appId: string;
  name: string;
  description: string;
  category: string;
  icon: string | null;
  currentVersionId: string;
  createdAt: string;
}

interface AppsResponse {
  apps: MarketplaceApp[];
  total: number;
}

const CATEGORIES: AppCategory[] = ["All", "Game", "Shopping", "Tool", "Social", "Other"];
const PAGE_SIZE = 12;

function AppsPageContent() {
  const router = useRouter();
  const [apps, setApps] = useState<MarketplaceApp[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<AppCategory>("All");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    loadApps();
  }, [selectedCategory, offset]);

  const loadApps = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedCategory !== "All") {
        params.set("category", selectedCategory);
      }
      if (searchQuery) {
        params.set("search", searchQuery);
      }
      params.set("limit", PAGE_SIZE.toString());
      params.set("offset", offset.toString());

      const data = await api<AppsResponse>(
        `/api/marketplace/apps?${params.toString()}`
      );
      setApps(data.apps);
      setTotal(data.total);
    } catch (error) {
      console.error("Failed to load apps:", error);
      setApps([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setOffset(0);
    loadApps();
  };

  const handleCategoryChange = (category: AppCategory) => {
    setSelectedCategory(category);
    setOffset(0);
  };

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-4xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/")}
            className="h-9 w-9"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">App Marketplace</h1>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search apps..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9 bg-neutral-800 border-none"
            />
          </div>
        </div>

        {/* Category Filters */}
        <div className="mb-6 flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              size="sm"
              onClick={() => handleCategoryChange(category)}
              className="rounded-full"
            >
              {category}
            </Button>
          ))}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty State */}
        {!loading && apps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No apps found</h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search or filters
            </p>
          </div>
        )}

        {/* Apps Grid */}
        {!loading && apps.length > 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {apps.map((app) => (
                <button
                  key={app.id}
                  onClick={() => router.push(`/apps/${app.id}`)}
                  className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-neutral-800/50"
                >
                  <div className="mb-3 flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-800">
                      <Package className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate mb-1">{app.name}</h3>
                      <span className="inline-block rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-muted-foreground">
                        {app.category}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {app.description}
                  </p>
                </button>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  disabled={offset === 0}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= total}
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

export default function AppsPage() {
  return (
    <AuthGuard>
      <AppsPageContent />
    </AuthGuard>
  );
}
