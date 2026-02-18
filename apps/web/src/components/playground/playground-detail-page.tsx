"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Users,
  LogIn,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlaygroundStore } from "@/store/playground-store";
import { useToastStore } from "@/store/toast-store";
import { playgroundWs } from "@/lib/playground-ws";
import type { PlaygroundDefinition } from "@arinova/shared/types";
import { PlaygroundDefinitionPreview } from "./playground-definition-preview";
import { WaitingRoom } from "./waiting-room";
import { ActiveSession } from "./active-session";
import { GameResult } from "./game-result";
import { AgentSelectDialog } from "./agent-select-dialog";

interface PlaygroundDetailPageProps {
  playgroundId: string;
}

export function PlaygroundDetailPage({ playgroundId }: PlaygroundDetailPageProps) {
  const router = useRouter();
  const addToast = useToastStore((s) => s.addToast);
  const {
    activePlayground,
    activePlaygroundLoading,
    activeSession,
    activeSessionLoading,
    loadPlayground,
    loadSession,
    clearActivePlayground,
    clearActiveSession,
    createSession,
    joinSession,
    deletePlayground,
    handleWSEvent,
  } = usePlaygroundStore();

  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [agentDialogMode, setAgentDialogMode] = useState<"create" | "join">("create");
  const [deleting, setDeleting] = useState(false);

  // Load playground detail
  useEffect(() => {
    loadPlayground(playgroundId);
    return () => {
      clearActivePlayground();
      clearActiveSession();
      playgroundWs.disconnect();
    };
  }, [playgroundId, loadPlayground, clearActivePlayground, clearActiveSession]);

  // When playground loads and has an active session, load session detail
  useEffect(() => {
    if (activePlayground?.activeSession) {
      loadSession(playgroundId, activePlayground.activeSession.id);
    }
  }, [activePlayground?.activeSession?.id, playgroundId, loadSession]);

  // Connect WebSocket when session is loaded and user is a participant
  useEffect(() => {
    if (!activeSession?.myParticipantId || !activeSession.id) return;

    playgroundWs.connect(activeSession.id);

    const unsub = playgroundWs.subscribe((event) => {
      handleWSEvent(event);
    });

    return () => {
      unsub();
      playgroundWs.disconnect();
    };
  }, [activeSession?.id, activeSession?.myParticipantId, handleWSEvent]);

  const handleCreateSession = useCallback(() => {
    setAgentDialogMode("create");
    setAgentDialogOpen(true);
  }, []);

  const handleJoinSession = useCallback(() => {
    setAgentDialogMode("join");
    setAgentDialogOpen(true);
  }, []);

  const handleAgentSelected = useCallback(
    async (agentId: string | null, controlMode: "human" | "agent") => {
      if (!activePlayground) return;

      if (agentDialogMode === "create") {
        await createSession(
          playgroundId,
          agentId ?? undefined,
          controlMode,
        );
        // Reload playground to get the active session
        await loadPlayground(playgroundId);
      } else if (activePlayground.activeSession) {
        await joinSession(
          playgroundId,
          activePlayground.activeSession.id,
          agentId ?? undefined,
          controlMode,
        );
      }
    },
    [activePlayground, agentDialogMode, playgroundId, createSession, joinSession, loadPlayground],
  );

  const handleDelete = useCallback(async () => {
    if (!confirm("Delete this playground? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deletePlayground(playgroundId);
      router.push("/playground");
    } finally {
      setDeleting(false);
    }
  }, [deletePlayground, playgroundId, router]);

  const handleBackFromResult = useCallback(() => {
    clearActiveSession();
    loadPlayground(playgroundId);
  }, [clearActiveSession, loadPlayground, playgroundId]);

  // Loading state
  if (activePlaygroundLoading && !activePlayground) {
    return (
      <div className="app-dvh flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activePlayground) {
    return (
      <div className="app-dvh flex flex-col items-center justify-center gap-4 bg-background">
        <p className="text-muted-foreground">Playground not found</p>
        <Link href="/playground">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>
    );
  }

  const definition = activePlayground.definition as PlaygroundDefinition;
  const hasActiveSession = !!activePlayground.activeSession;
  const isMySession = !!activeSession?.myParticipantId;
  const sessionStatus = activeSession?.status;

  return (
    <div className="app-dvh overflow-y-auto bg-background">
      <div className="mx-auto max-w-4xl px-4 pb-[max(2rem,env(safe-area-inset-bottom,2rem))] pt-[max(1.25rem,env(safe-area-inset-top,1.25rem))]">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link href="/playground">
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{activePlayground.name}</h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-muted-foreground hover:text-red-400"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Session loading */}
        {activeSessionLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Finished session — show results */}
        {sessionStatus === "finished" && activeSession && (
          <GameResult
            participants={activeSession.participants}
            state={activeSession.state}
            definition={definition}
            myParticipantId={activeSession.myParticipantId}
            onBack={handleBackFromResult}
          />
        )}

        {/* Active session — show game UI */}
        {sessionStatus === "active" && activeSession && (
          <ActiveSession
            playgroundId={playgroundId}
            sessionId={activeSession.id}
            state={activeSession.state}
            currentPhase={activeSession.currentPhase}
            participants={activeSession.participants}
            myParticipantId={activeSession.myParticipantId}
            myRole={activeSession.myRole}
            definition={definition}
          />
        )}

        {/* Waiting session — show waiting room */}
        {sessionStatus === "waiting" && activeSession && (
          <WaitingRoom
            playgroundId={playgroundId}
            sessionId={activeSession.id}
            participants={activeSession.participants}
            myParticipantId={activeSession.myParticipantId}
            definition={definition}
            isHost={
              activeSession.participants.length > 0 &&
              activeSession.myParticipantId === activeSession.participants[0]?.id
            }
          />
        )}

        {/* No active session or user is not in the session — show playground info + actions */}
        {!activeSessionLoading && (!activeSession || !isMySession) && sessionStatus !== "finished" && (
          <>
            {/* Playground info */}
            <div className="mb-6">
              <PlaygroundDefinitionPreview definition={definition} />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              {!hasActiveSession && (
                <Button className="gap-2" onClick={handleCreateSession}>
                  <Plus className="h-4 w-4" />
                  Create Session
                </Button>
              )}
              {hasActiveSession && !isMySession && (
                <Button className="gap-2" onClick={handleJoinSession}>
                  <LogIn className="h-4 w-4" />
                  Join Session
                  <span className="ml-1 text-xs opacity-70">
                    ({activePlayground.activeSession?.participantCount ?? 0} / {definition.metadata.maxPlayers})
                  </span>
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <AgentSelectDialog
        open={agentDialogOpen}
        onOpenChange={setAgentDialogOpen}
        onSelect={handleAgentSelected}
      />
    </div>
  );
}
