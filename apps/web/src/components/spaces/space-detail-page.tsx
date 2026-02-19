"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useSpacesStore } from "@/store/spaces-store";
import { JoinDialog } from "./join-dialog";
import {
  ArrowLeft,
  Loader2,
  Gamepad2,
  Users,
  Play,
  LogOut,
  Trash2,
  Plus,
  Clock,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";

const STATUS_COLORS: Record<string, string> = {
  waiting: "bg-yellow-500/20 text-yellow-400",
  active: "bg-green-500/20 text-green-400",
  paused: "bg-neutral-500/20 text-neutral-400",
  finished: "bg-red-500/20 text-red-400",
};

const CATEGORY_COLORS: Record<string, string> = {
  game: "bg-purple-500/20 text-purple-400",
  strategy: "bg-blue-500/20 text-blue-400",
  social: "bg-pink-500/20 text-pink-400",
  puzzle: "bg-amber-500/20 text-amber-400",
  roleplay: "bg-emerald-500/20 text-emerald-400",
  other: "bg-neutral-500/20 text-neutral-400",
};

export function SpaceDetailPage({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const {
    currentSpace,
    detailLoading,
    fetchSpaceDetail,
    createSession,
    leaveSession,
    deleteSpace,
  } = useSpacesStore();

  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [joinTarget, setJoinTarget] = useState<{
    spaceId: string;
    sessionId: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchSpaceDetail(spaceId);
  }, [spaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateSession = async () => {
    setActionLoading("create-session");
    try {
      await createSession(spaceId);
    } finally {
      setActionLoading(null);
    }
  };

  const handleJoinClick = (sessionId: string) => {
    setJoinTarget({ spaceId, sessionId });
    setJoinDialogOpen(true);
  };

  const handleLeave = async (sessionId: string) => {
    setActionLoading(`leave-${sessionId}`);
    try {
      await leaveSession(spaceId, sessionId);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this space? This cannot be undone.")) return;
    setActionLoading("delete");
    try {
      await deleteSpace(spaceId);
      router.push("/spaces");
    } finally {
      setActionLoading(null);
    }
  };

  if (detailLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!currentSpace) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background">
        <Gamepad2 className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Space not found</p>
        <Button variant="secondary" onClick={() => router.push("/spaces")}>
          Back to Spaces
        </Button>
      </div>
    );
  }

  const isOwner = userId === currentSpace.ownerId;

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push("/spaces")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">
            {currentSpace.name}
          </h1>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                CATEGORY_COLORS[currentSpace.category?.toLowerCase()] ??
                CATEGORY_COLORS.other
              }`}
            >
              {currentSpace.category}
            </span>
            {currentSpace.owner && (
              <span className="text-xs text-muted-foreground">
                by {currentSpace.owner.name}
              </span>
            )}
          </div>
        </div>
        {isOwner && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-400 hover:text-red-300"
            onClick={handleDelete}
            disabled={actionLoading === "delete"}
          >
            {actionLoading === "delete" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Space Info */}
      <div className="shrink-0 border-b border-neutral-800 px-4 py-4">
        <p className="text-sm text-muted-foreground">
          {currentSpace.description}
        </p>
        {currentSpace.tags && currentSpace.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {currentSpace.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sessions */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Sessions
          </h2>
          <Button
            size="sm"
            className="gap-1"
            onClick={handleCreateSession}
            disabled={actionLoading === "create-session"}
          >
            {actionLoading === "create-session" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            New Session
          </Button>
        </div>

        {!currentSpace.sessions || currentSpace.sessions.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Clock className="h-8 w-8" />
            <p className="text-sm">No sessions yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {currentSpace.sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        STATUS_COLORS[s.status] ?? STATUS_COLORS.waiting
                      }`}
                    >
                      {s.status}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {s.participantCount}
                    </span>
                    {s.currentPhase && (
                      <span className="text-xs text-muted-foreground">
                        Phase: {s.currentPhase}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(s.createdAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex gap-2">
                  {s.status !== "finished" && (
                    <Button
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => handleJoinClick(s.id)}
                    >
                      <Play className="h-3 w-3" />
                      Join
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs text-red-400 hover:text-red-300"
                    onClick={() => handleLeave(s.id)}
                    disabled={actionLoading === `leave-${s.id}`}
                  >
                    {actionLoading === `leave-${s.id}` ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <LogOut className="h-3 w-3" />
                    )}
                    Leave
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <JoinDialog
        open={joinDialogOpen}
        onOpenChange={setJoinDialogOpen}
        spaceId={joinTarget?.spaceId ?? ""}
        sessionId={joinTarget?.sessionId ?? ""}
      />
    </div>
  );
}
