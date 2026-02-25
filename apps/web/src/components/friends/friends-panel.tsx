"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, UserMinus, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { assetUrl } from "@/lib/config";
import type { Conversation } from "@arinova/shared/types";

interface Friend {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
}

interface FriendsPanelProps {
  onStartConversation?: (conversationId: string) => void;
}

export function FriendsPanel({ onStartConversation }: FriendsPanelProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

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

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

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
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
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
        <p className="py-8 text-center text-sm text-muted-foreground">
          No friends yet. Send a friend request to get started!
        </p>
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
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {friend.name ?? friend.username ?? "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    @{friend.username ?? "unknown"}
                  </p>
                </div>
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
