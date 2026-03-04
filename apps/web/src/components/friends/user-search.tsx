"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Search, UserPlus, Loader2, Check } from "lucide-react";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { api } from "@/lib/api";
import { assetUrl } from "@/lib/config";
import { useTranslation } from "@/lib/i18n";

interface SearchUser {
  id: string;
  username: string;
  name: string | null;
  image: string | null;
  isVerified?: boolean;
}

interface UserSearchProps {
  onRequestSent?: (username: string) => void;
}

export function UserSearch({ onRequestSent }: UserSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sentUsernames, setSentUsernames] = useState<Set<string>>(new Set());
  const [sendingUsername, setSendingUsername] = useState<string | null>(null);
  const [error, setError] = useState("");

  const searchUsers = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const data = await api<SearchUser[]>(
        `/api/users/search?q=${encodeURIComponent(q)}&exact=true`
      );
      setResults(data);
    } catch {
      setResults([]);
      setError(t("friends.search.error"));
    } finally {
      setLoading(false);
    }
  }, [query, t]);

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
        err instanceof Error ? err.message : t("friends.search.requestFailed")
      );
    } finally {
      setSendingUsername(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("friends.search.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") searchUsers(); }}
            className="pl-9 bg-neutral-800 border-none"
            autoFocus
          />
        </div>
        <Button
          size="sm"
          className="shrink-0 gap-1.5"
          disabled={loading || !query.trim()}
          onClick={searchUsers}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          {t("friends.search.button")}
        </Button>
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

        {!loading && searched && results.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("friends.search.noResults")}
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
                  <p className="flex items-center gap-1 text-sm font-medium truncate">
                    {user.name ?? user.username}
                    {user.isVerified && <VerifiedBadge className="h-3.5 w-3.5 shrink-0 text-blue-500" />}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    @{user.username}
                  </p>
                </div>
                {isSent ? (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <Check className="h-3.5 w-3.5" />
                    {t("friends.search.sent")}
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
                    {t("friends.search.addFriend")}
                  </Button>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
