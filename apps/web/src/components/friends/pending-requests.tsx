"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Check, X, Loader2, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { assetUrl } from "@/lib/config";

interface FriendRequest {
  id: string;
  userId: string;
  name: string | null;
  username: string | null;
  image: string | null;
}

interface PendingRequestsData {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

interface PendingRequestsProps {
  onCountChange?: (count: number) => void;
}

export function PendingRequests({ onCountChange }: PendingRequestsProps) {
  const [data, setData] = useState<PendingRequestsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadRequests = useCallback(async () => {
    try {
      const result = await api<PendingRequestsData>("/api/friends/requests");
      setData(result);
      onCountChange?.(result.incoming.length);
    } catch {
      setError("Failed to load friend requests");
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleAccept = async (friendshipId: string) => {
    setActionLoading(friendshipId);
    setError("");
    try {
      await api(`/api/friends/accept/${friendshipId}`, { method: "POST" });
      await loadRequests();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to accept request"
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (friendshipId: string) => {
    setActionLoading(friendshipId);
    setError("");
    try {
      await api(`/api/friends/reject/${friendshipId}`, { method: "POST" });
      await loadRequests();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reject request"
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

  if (!data) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Failed to load requests
      </p>
    );
  }

  const hasRequests =
    data.incoming.length > 0 || data.outgoing.length > 0;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {!hasRequests && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No pending requests
        </p>
      )}

      {data.incoming.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground px-1">
            Incoming ({data.incoming.length})
          </h3>
          <div className="space-y-1">
            {data.incoming.map((req) => {
              const isActing = actionLoading === req.id;
              return (
                <div
                  key={req.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent transition-colors"
                >
                  <Avatar>
                    {req.image ? (
                      <AvatarImage
                        src={assetUrl(req.image)}
                        alt={req.username ?? ""}
                      />
                    ) : null}
                    <AvatarFallback>
                      {(req.name ?? req.username ?? "?")
                        .charAt(0)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {req.name ?? req.username ?? "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      @{req.username ?? "unknown"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 text-green-400 hover:text-green-300 hover:border-green-600"
                      disabled={isActing}
                      onClick={() => handleAccept(req.id)}
                      title="Accept"
                    >
                      {isActing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 text-red-400 hover:text-red-300 hover:border-red-600"
                      disabled={isActing}
                      onClick={() => handleReject(req.id)}
                      title="Reject"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.outgoing.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground px-1">
            Outgoing ({data.outgoing.length})
          </h3>
          <div className="space-y-1">
            {data.outgoing.map((req) => (
              <div
                key={req.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent transition-colors"
              >
                <Avatar>
                  {req.image ? (
                    <AvatarImage
                      src={assetUrl(req.image)}
                      alt={req.username ?? ""}
                    />
                  ) : null}
                  <AvatarFallback>
                    {(req.name ?? req.username ?? "?")
                      .charAt(0)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {req.name ?? req.username ?? "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    @{req.username ?? "unknown"}
                  </p>
                </div>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                  <Clock className="h-3.5 w-3.5" />
                  Pending
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
