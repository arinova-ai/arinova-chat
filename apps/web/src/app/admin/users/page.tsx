"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { assetUrl } from "@/lib/config";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import {
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  BadgeCheck,
  BadgeMinus,
} from "lucide-react";

interface UserItem {
  id: string;
  name: string;
  email: string;
  username: string | null;
  image: string | null;
  isVerified: boolean;
  createdAt: string;
}

interface UsersResponse {
  users: UserItem[];
  total: number;
  page: number;
  limit: number;
}

export default function AdminUsersPage() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const limit = 20;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.trim()) params.set("search", search.trim());
      const res = await api<UsersResponse>(`/api/admin/users?${params}`);
      setData(res);
    } catch {
      // api() auto-toasts
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const toggleVerify = async (user: UserItem) => {
    setTogglingId(user.id);
    try {
      await api(`/api/admin/users/${user.id}/verify`, {
        method: "PATCH",
        body: JSON.stringify({ verified: !user.isVerified }),
      });
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          users: prev.users.map((u) =>
            u.id === user.id ? { ...u, isVerified: !u.isVerified } : u
          ),
        };
      });
    } catch {
      // api() auto-toasts
    } finally {
      setTogglingId(null);
    }
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="p-6">
      <h2 className="mb-6 text-xl font-bold text-foreground">User Management</h2>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email or username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* User list */}
      {!loading && data && (
        <>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {data.users.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No users found.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {data.users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      {user.image ? (
                        <AvatarImage
                          src={assetUrl(user.image)}
                          alt={user.name}
                        />
                      ) : null}
                      <AvatarFallback className="bg-accent text-sm">
                        {(user.name || "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-foreground truncate">
                          {user.name}
                        </span>
                        {user.isVerified && <VerifiedBadge />}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {user.username && <span>@{user.username}</span>}
                        <span>{user.email}</span>
                      </div>
                    </div>

                    <span className="hidden sm:block text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </span>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 gap-1.5"
                      disabled={togglingId === user.id}
                      onClick={() => toggleVerify(user)}
                    >
                      {togglingId === user.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : user.isVerified ? (
                        <>
                          <BadgeMinus className="h-4 w-4" />
                          <span className="hidden sm:inline">Unverify</span>
                        </>
                      ) : (
                        <>
                          <BadgeCheck className="h-4 w-4" />
                          <span className="hidden sm:inline">Verify</span>
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {data.total} users total
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
