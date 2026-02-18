"use client";

import { Button } from "@/components/ui/button";
import { Trophy, Users, ArrowLeft } from "lucide-react";
import type { PlaygroundParticipant, PlaygroundDefinition } from "@arinova/shared/types";
import { cn } from "@/lib/utils";

interface GameResultProps {
  participants: PlaygroundParticipant[];
  state: Record<string, unknown>;
  definition: PlaygroundDefinition;
  myParticipantId: string | null;
  onBack: () => void;
}

export function GameResult({
  participants,
  state,
  definition,
  myParticipantId,
  onBack,
}: GameResultProps) {
  // Determine winners from state
  const winners = (state.winners as string[] | undefined) ?? [];
  const isWinner = myParticipantId ? winners.includes(myParticipantId) : false;

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {/* Trophy / Result header */}
      <div className="text-center">
        <div
          className={cn(
            "mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full",
            isWinner
              ? "bg-amber-500/20 text-amber-400"
              : "bg-neutral-700 text-muted-foreground",
          )}
        >
          <Trophy className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold">
          {isWinner ? "Victory!" : "Game Over"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {definition.metadata.name} has ended
        </p>
      </div>

      {/* Role Reveals */}
      <div className="w-full max-w-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Users className="h-4 w-4" />
          Role Reveals
        </h3>
        <div className="space-y-2">
          {participants.map((p, i) => {
            const isMe = p.id === myParticipantId;
            const isParticipantWinner = winners.includes(p.id);

            return (
              <div
                key={p.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3",
                  isParticipantWinner
                    ? "border-amber-500/50 bg-amber-500/10"
                    : "border-border bg-neutral-900",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    Player {i + 1}
                    {isMe && (
                      <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                    )}
                  </p>
                  {p.role && (
                    <p className="text-xs text-muted-foreground">
                      Role: <span className="text-foreground">{p.role}</span>
                    </p>
                  )}
                </div>
                {isParticipantWinner && (
                  <Trophy className="h-4 w-4 text-amber-400" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Win Conditions Summary */}
      {definition.winConditions.length > 0 && (
        <div className="w-full max-w-sm">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            Win Conditions
          </h3>
          <div className="space-y-1">
            {definition.winConditions.map((wc, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{wc.role}</span>
                {" — "}
                {wc.description}
              </p>
            ))}
          </div>
        </div>
      )}

      <Button onClick={onBack} variant="outline" className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back to Playground
      </Button>
    </div>
  );
}
