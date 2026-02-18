"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Users, Play, LogOut, Bot, User, Crown } from "lucide-react";
import { usePlaygroundStore } from "@/store/playground-store";
import type { PlaygroundDefinition, PlaygroundParticipant } from "@arinova/shared/types";
import { cn } from "@/lib/utils";

interface WaitingRoomProps {
  playgroundId: string;
  sessionId: string;
  participants: PlaygroundParticipant[];
  myParticipantId: string | null;
  definition: PlaygroundDefinition;
  isHost: boolean;
}

export function WaitingRoom({
  playgroundId,
  sessionId,
  participants,
  myParticipantId,
  definition,
  isHost,
}: WaitingRoomProps) {
  const { startSession, leaveSession } = usePlaygroundStore();
  const [starting, setStarting] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const { minPlayers, maxPlayers } = definition.metadata;
  const canStart = participants.length >= minPlayers;
  const isFull = participants.length >= maxPlayers;

  const handleStart = async () => {
    setStarting(true);
    try {
      await startSession(playgroundId, sessionId);
    } finally {
      setStarting(false);
    }
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await leaveSession(playgroundId, sessionId);
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div className="text-center">
        <h2 className="text-xl font-bold">Waiting Room</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Waiting for players to join...
        </p>
      </div>

      {/* Player count */}
      <div className="flex items-center gap-2 rounded-full bg-neutral-800 px-4 py-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {participants.length} / {maxPlayers}
        </span>
        <span className="text-xs text-muted-foreground">
          (min {minPlayers})
        </span>
      </div>

      {/* Participant list */}
      <div className="w-full max-w-sm space-y-2">
        {participants.map((p, i) => (
          <div
            key={p.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border border-border bg-neutral-900 p-3",
              p.id === myParticipantId && "border-primary/50",
            )}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-700">
              {p.agentId ? (
                <Bot className="h-4 w-4" />
              ) : (
                <User className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                Player {i + 1}
                {p.id === myParticipantId && (
                  <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {p.agentId ? "Agent-controlled" : "Human"}
              </p>
            </div>
            {i === 0 && (
              <Crown className="h-4 w-4 text-amber-400" title="Host" />
            )}
            {p.isConnected && (
              <span className="h-2 w-2 rounded-full bg-green-400" title="Online" />
            )}
          </div>
        ))}

        {/* Empty slots */}
        {Array.from({ length: Math.max(0, minPlayers - participants.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="flex items-center gap-3 rounded-lg border border-dashed border-border/50 p-3"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800">
              <User className="h-4 w-4 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground/50">Waiting for player...</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {isHost && (
          <Button
            onClick={handleStart}
            disabled={!canStart || starting}
            className="gap-2"
          >
            {starting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Start Game
            {!canStart && ` (need ${minPlayers - participants.length} more)`}
          </Button>
        )}
        {myParticipantId && (
          <Button
            variant="outline"
            onClick={handleLeave}
            disabled={leaving}
            className="gap-2"
          >
            {leaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            Leave
          </Button>
        )}
      </div>

      {isFull && (
        <p className="text-xs text-amber-400">
          Session is full
        </p>
      )}
    </div>
  );
}
