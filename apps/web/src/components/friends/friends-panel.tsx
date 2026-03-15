"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, UserMinus, Loader2, Users, Building2 } from "lucide-react";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { ArinovaSpinner } from "@/components/ui/arinova-spinner";
import { api } from "@/lib/api";
import { assetUrl } from "@/lib/config";
import { useAccountStore, type AccountSubscriber } from "@/store/account-store";
import { useTranslation } from "@/lib/i18n";
import type { Conversation } from "@arinova/shared/types";

interface Friend {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  isVerified?: boolean;
}

interface FriendsPanelProps {
  onStartConversation?: (conversationId: string) => void;
}

export function FriendsPanel({ onStartConversation }: FriendsPanelProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  // Account mode: show subscribers instead of friends
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const activeAccount = useAccountStore((s) => s.accounts.find((a) => a.id === s.activeAccountId));
  const loadSubscribers = useAccountStore((s) => s.loadSubscribers);
  const [subscribers, setSubscribers] = useState<AccountSubscriber[]>([]);

  const loadFriends = useCallback(async () => {
    try {
      const data = await api<Friend[]>("/api/friends");
      setFriends(data);
    } catch {
      setError("Failed to load friends");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSubscribersList = useCallback(async () => {
    if (!activeAccountId) return;
    setLoading(true);
    try {
      const data = await loadSubscribers(activeAccountId);
      setSubscribers(data);
    } catch {
      setError("Failed to load subscribers");
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, loadSubscribers]);

  useEffect(() => {
    if (activeAccountId) {
      loadSubscribersList();
    } else {
      loadFriends();
    }
  }, [activeAccountId, loadFriends, loadSubscribersList]);

  const handleStartConversation = async (friendId: string) => {
    setActionLoading(friendId);
    setError("");
    try {
      const conv = await api<Conversation>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ targetUserId: friendId }),
      });
      onStartConversation?.(conv.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start conversation"
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveFriend = async (userId: string) => {
    setActionLoading(userId);
    setError("");
    try {
      await api(`/api/friends/${userId}`, { method: "DELETE" });
      setFriends((prev) => prev.filter((f) => f.id !== userId));
      setConfirmRemoveId(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove friend"
      );
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <ArinovaSpinner size="sm" />
      </div>
    );
  }

  // Account mode: render subscribers
  if (activeAccountId && activeAccount) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Building2 className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-medium">{t("accounts.subscribers")}</span>
          <span className="text-xs text-muted-foreground">({subscribers.length})</span>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {subscribers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Users className="h-10 w-10 opacity-40 mb-2" />
            <p className="text-sm">{t("accounts.noSubscribers")}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {subscribers.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent transition-colors"
              >
                <Avatar>
                  {sub.userImage ? (
                    <AvatarImage src={assetUrl(sub.userImage)} />
                  ) : null}
                  <AvatarFallback>
                    {(sub.userName ?? "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{sub.userName}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("accounts.subscribedSince")} {new Date(sub.subscribedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {friends.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Users className="h-10 w-10 opacity-40 mb-2" />
          <p className="text-sm">No friends yet. Send a friend request to get started!</p>
        </div>
      ) : (
        <div className="space-y-1">
          {friends.map((friend) => {
            const isActing = actionLoading === friend.id;
            const isConfirming = confirmRemoveId === friend.id;

            return (
              <div
                key={friend.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent transition-colors"
              >
                <button
                  type="button"
                  onClick={() => router.push(`/profile/${friend.id}`)}
                  className="flex items-center gap-3 min-w-0 flex-1 rounded-lg -ml-1 px-1 py-0.5 transition-colors hover:bg-accent/60 cursor-pointer"
                >
                  <Avatar>
                    {friend.image ? (
                      <AvatarImage
                        src={assetUrl(friend.image)}
                        alt={friend.username ?? ""}
                      />
                    ) : null}
                    <AvatarFallback>
                      {(friend.name ?? friend.username ?? "?")
                        .charAt(0)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="flex items-center gap-1 text-sm font-medium truncate">
                      {friend.name ?? friend.username ?? "Unknown"}
                      {friend.isVerified && <VerifiedBadge className="h-3.5 w-3.5 shrink-0 text-blue-500" />}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      @{friend.username ?? "unknown"}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isConfirming ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-400 hover:text-red-300 hover:border-red-600"
                        disabled={isActing}
                        onClick={() => handleRemoveFriend(friend.id)}
                      >
                        {isActing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Confirm"
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmRemoveId(null)}
                        disabled={isActing}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={isActing}
                        onClick={() =>
                          handleStartConversation(friend.id)
                        }
                        title="Start Conversation"
                      >
                        {actionLoading === friend.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MessageSquare className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-red-400 hover:text-red-300 hover:border-red-600"
                        onClick={() => setConfirmRemoveId(friend.id)}
                        title="Remove Friend"
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
