"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Agent } from "@arinova/shared/types";
import { api } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Search,
  Bot,
  Plus,
  Check,
  Loader2,
  Users,
} from "lucide-react";

interface MarketplaceAgent {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  category: string | null;
  usageCount: number;
  ownerId: string;
  createdAt: string;
}

interface MarketplaceResponse {
  agents: MarketplaceAgent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function MarketplaceContent() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [agents, setAgents] = useState<MarketplaceAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [categories, setCategories] = useState<
    { category: string; count: number }[]
  >([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (query) params.set("q", query);
      if (activeCategory) params.set("category", activeCategory);

      const data = await api<MarketplaceResponse>(
        `/api/marketplace?${params.toString()}`
      );
      setAgents(data.agents);
      setTotalPages(data.pagination.totalPages);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, query, activeCategory]);

  const loadCategories = useCallback(async () => {
    try {
      const data = await api<{ category: string; count: number }[]>(
        "/api/marketplace/categories"
      );
      setCategories(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handleAdd = async (agentId: string) => {
    setAddingId(agentId);
    try {
      await api(`/api/marketplace/${agentId}/add`, { method: "POST" });
      setAddedIds((prev) => new Set(prev).add(agentId));
    } catch {
      // might already have it
    } finally {
      setAddingId(null);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadAgents();
  };

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">Agent Marketplace</h1>
            <p className="text-sm text-muted-foreground">
              Browse and add public agents to your collection
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-6">
        {/* Search */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents..."
              className="bg-neutral-800 border-none pl-9"
            />
          </div>
        </form>

        {/* Categories */}
        {categories.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            <Button
              variant={activeCategory === null ? "secondary" : "outline"}
              size="sm"
              onClick={() => {
                setActiveCategory(null);
                setPage(1);
              }}
            >
              All
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat.category}
                variant={
                  activeCategory === cat.category ? "secondary" : "outline"
                }
                size="sm"
                onClick={() => {
                  setActiveCategory(cat.category);
                  setPage(1);
                }}
              >
                {cat.category} ({cat.count})
              </Button>
            ))}
          </div>
        )}

        {/* Agent grid */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : agents.length === 0 ? (
          <div className="py-12 text-center">
            <Bot className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">
              No agents found in the marketplace yet.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Publish your own agents to share them with others.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-700">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold">{agent.name}</h3>
                    {agent.category && (
                      <span className="text-xs text-blue-400">
                        {agent.category}
                      </span>
                    )}
                  </div>
                </div>
                {agent.description && (
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                    {agent.description}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {agent.usageCount} users
                  </span>
                  {addedIds.has(agent.id) ? (
                    <Button size="xs" variant="secondary" disabled>
                      <Check className="h-3 w-3" />
                      Added
                    </Button>
                  ) : (
                    <Button
                      size="xs"
                      onClick={() => handleAdd(agent.id)}
                      disabled={addingId === agent.id}
                    >
                      {addingId === agent.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                      Add
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <Button
              variant="outline"
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
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
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
