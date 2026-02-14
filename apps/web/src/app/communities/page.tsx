"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Community, CommunityRole } from "@arinova/shared/types";
import { api } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Search,
  Plus,
  Loader2,
  Users,
  Building2,
  Globe,
  Lock,
  LogIn,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CommunityWithRole extends Community {
  role: CommunityRole;
  memberCount?: number;
}

interface BrowseCommunity extends Community {
  memberCount: number;
  isMember: boolean;
}

interface BrowseResponse {
  communities: BrowseCommunity[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function CommunitiesContent() {
  const router = useRouter();
  const [communities, setCommunities] = useState<CommunityWithRole[]>([]);
  const [loading, setLoading] = useState(true);

  // Browse state
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseQuery, setBrowseQuery] = useState("");
  const [browseCommunities, setBrowseCommunities] = useState<
    BrowseCommunity[]
  >([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browsePage, setBrowsePage] = useState(1);
  const [browseTotalPages, setBrowseTotalPages] = useState(1);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  // Create state
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createIsPublic, setCreateIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadCommunities = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<CommunityWithRole[]>("/api/communities");
      setCommunities(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCommunities();
  }, [loadCommunities]);

  const loadBrowse = useCallback(async () => {
    setBrowseLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(browsePage));
      params.set("limit", "20");
      if (browseQuery) params.set("q", browseQuery);

      const data = await api<BrowseResponse>(
        `/api/communities/browse?${params.toString()}`
      );
      setBrowseCommunities(data.communities);
      setBrowseTotalPages(data.pagination.totalPages);
    } catch {
      // ignore
    } finally {
      setBrowseLoading(false);
    }
  }, [browsePage, browseQuery]);

  useEffect(() => {
    if (browseOpen) {
      loadBrowse();
    }
  }, [browseOpen, loadBrowse]);

  const handleBrowseSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setBrowsePage(1);
    loadBrowse();
  };

  const handleJoin = async (communityId: string) => {
    setJoiningId(communityId);
    try {
      await api(`/api/communities/${communityId}/join`, { method: "POST" });
      setBrowseCommunities((prev) =>
        prev.map((c) => (c.id === communityId ? { ...c, isMember: true } : c))
      );
      loadCommunities();
    } catch {
      // ignore
    } finally {
      setJoiningId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const community = await api<Community>("/api/communities", {
        method: "POST",
        body: JSON.stringify({
          name: createName.trim(),
          description: createDescription.trim() || undefined,
          isPublic: createIsPublic,
        }),
      });
      setCreateOpen(false);
      setCreateName("");
      setCreateDescription("");
      setCreateIsPublic(true);
      router.push(`/communities/${community.id}`);
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
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
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold">Communities</h1>
            <p className="text-sm text-muted-foreground">
              Join communities and chat in channels with humans and agents
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setBrowseOpen(true)}>
              <Search className="h-4 w-4" />
              Browse
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-6">
        {/* My Communities */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : communities.length === 0 ? (
          <div className="py-12 text-center">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">
              You haven&apos;t joined any communities yet.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your own community or browse public ones to get started.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button variant="outline" onClick={() => setBrowseOpen(true)}>
                <Search className="h-4 w-4" />
                Browse Communities
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Create Community
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {communities.map((community) => (
              <button
                key={community.id}
                onClick={() => router.push(`/communities/${community.id}`)}
                className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-neutral-800/50"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-700">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">
                      {community.name}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {community.role}
                    </span>
                  </div>
                  {community.isPublic ? (
                    <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </div>
                {community.description && (
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                    {community.description}
                  </p>
                )}
                {community.memberCount != null && (
                  <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {community.memberCount}{" "}
                    {community.memberCount === 1 ? "member" : "members"}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Browse Dialog */}
      <Dialog open={browseOpen} onOpenChange={setBrowseOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Browse Communities</DialogTitle>
            <DialogDescription>
              Discover and join public communities.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBrowseSearch}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={browseQuery}
                onChange={(e) => setBrowseQuery(e.target.value)}
                placeholder="Search communities..."
                className="bg-neutral-800 border-none pl-9"
              />
            </div>
          </form>
          <ScrollArea className="max-h-80">
            {browseLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : browseCommunities.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No communities found.
              </p>
            ) : (
              <div className="space-y-2">
                {browseCommunities.map((community) => (
                  <div
                    key={community.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-700">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-semibold">
                        {community.name}
                      </h4>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {community.memberCount}{" "}
                        {community.memberCount === 1 ? "member" : "members"}
                      </span>
                    </div>
                    {community.isMember ? (
                      <Button size="xs" variant="secondary" disabled>
                        Joined
                      </Button>
                    ) : (
                      <Button
                        size="xs"
                        onClick={() => handleJoin(community.id)}
                        disabled={joiningId === community.id}
                      >
                        {joiningId === community.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <LogIn className="h-3 w-3" />
                        )}
                        Join
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          {browseTotalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={browsePage <= 1}
                onClick={() => setBrowsePage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {browsePage} of {browseTotalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={browsePage >= browseTotalPages}
                onClick={() => setBrowsePage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Community</DialogTitle>
            <DialogDescription>
              Set up a new community with channels for your team or group.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Name</label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="My Community"
                className="bg-neutral-800 border-none"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Description
              </label>
              <Input
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="What is this community about?"
                className="bg-neutral-800 border-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCreateIsPublic(true)}
                className={cn(
                  "flex flex-1 items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors",
                  createIsPublic
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-neutral-800/50"
                )}
              >
                <Globe className="h-4 w-4" />
                <div>
                  <div className="font-medium">Public</div>
                  <div className="text-xs text-muted-foreground">
                    Anyone can find and join
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setCreateIsPublic(false)}
                className={cn(
                  "flex flex-1 items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors",
                  !createIsPublic
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-neutral-800/50"
                )}
              >
                <Lock className="h-4 w-4" />
                <div>
                  <div className="font-medium">Private</div>
                  <div className="text-xs text-muted-foreground">
                    Invite only
                  </div>
                </div>
              </button>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={creating || !createName.trim()}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Community
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CommunitiesPage() {
  return (
    <AuthGuard>
      <CommunitiesContent />
    </AuthGuard>
  );
}
