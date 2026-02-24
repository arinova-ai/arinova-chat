"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Search, UserPlus, Loader2, Check } from "lucide-react";
import { api } from "@/lib/api";
import { assetUrl } from "@/lib/config";

interface SearchUser {
  id: string;
  username: string;
  name: string | null;
  image: string | null;
}

interface UserSearchProps {
  onRequestSent?: (username: string) => void;
}

export function UserSearch({ onRequestSent }: UserSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [sentUsernames, setSentUsernames] = useState<Set<string>>(new Set());
  const [sendingUsername, setSendingUsername] = useState<string | null>(null);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await api<SearchUser[]>(
        `/api/users/search?q=${encodeURIComponent(q.trim())}`
      );
      setResults(data);
    } catch {
      setResults([]);
      setError("Failed to search users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      searchUsers(query);
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, searchUsers]);

  const handleSendRequest = async (username: string) => {
    setSendingUsername(username);
    setError("");
    try {
      await api("/api/friends/request", {
        method: "POST",
        body: JSON.stringify({ username }),
      });
      setSentUsernames((prev) => new Set(prev).add(username));
      onRequestSent?.(username);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send friend request"
      );
    } finally {
      setSendingUsername(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by username..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 bg-neutral-800 border-none"
          autoFocus
        />
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="max-h-64 overflow-y-auto space-y-1">
        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && query.trim() && results.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No users found
          </p>
        )}

        {!loading &&
          results.map((user) => {
            const isSent = sentUsernames.has(user.username);
            const isSending = sendingUsername === user.username;

            return (
              <div
                key={user.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent transition-colors"
              >
                <Avatar>
                  {user.image ? (
                    <AvatarImage
                      src={assetUrl(user.image)}
                      alt={user.username}
                    />
                  ) : null}
                  <AvatarFallback>
                    {(user.name ?? user.username ?? "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {user.name ?? user.username}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    @{user.username}
                  </p>
                </div>
                {isSent ? (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <Check className="h-3.5 w-3.5" />
                    Sent
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSending}
                    onClick={() => handleSendRequest(user.username)}
                    className="shrink-0 gap-1.5"
                  >
                    {isSending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="h-3.5 w-3.5" />
                    )}
                    Add Friend
                  </Button>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
