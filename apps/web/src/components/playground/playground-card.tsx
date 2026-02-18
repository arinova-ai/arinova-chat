"use client";

import type { PlaygroundCategory } from "@arinova/shared/types";
import { Users, Gamepad2, Brain, MessageCircle, Puzzle, Drama, Shapes } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_CONFIG: Record<
  PlaygroundCategory,
  { label: string; icon: typeof Gamepad2; color: string }
> = {
  game: { label: "Game", icon: Gamepad2, color: "bg-green-500/20 text-green-400" },
  strategy: { label: "Strategy", icon: Brain, color: "bg-blue-500/20 text-blue-400" },
  social: { label: "Social", icon: MessageCircle, color: "bg-pink-500/20 text-pink-400" },
  puzzle: { label: "Puzzle", icon: Puzzle, color: "bg-amber-500/20 text-amber-400" },
  roleplay: { label: "Roleplay", icon: Drama, color: "bg-purple-500/20 text-purple-400" },
  other: { label: "Other", icon: Shapes, color: "bg-neutral-500/20 text-neutral-400" },
};

interface PlaygroundCardProps {
  name: string;
  description: string | null;
  category: PlaygroundCategory;
  minPlayers: number;
  maxPlayers: number;
  activeSessionStatus?: string | null;
  activeParticipantCount?: number;
  onClick: () => void;
}

export function PlaygroundCard({
  name,
  description,
  category,
  minPlayers,
  maxPlayers,
  activeSessionStatus,
  activeParticipantCount,
  onClick,
}: PlaygroundCardProps) {
  const cat = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.other;
  const CatIcon = cat.icon;

  const isLive = activeSessionStatus === "waiting" || activeSessionStatus === "active";

  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-neutral-600 hover:bg-card/80"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold leading-tight line-clamp-1">{name}</h3>
        {isLive && (
          <span className="shrink-0 rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
            {activeSessionStatus === "waiting" ? "Waiting" : "Live"}
          </span>
        )}
      </div>

      {/* Description */}
      {description && (
        <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
      )}

      {/* Footer */}
      <div className="mt-auto flex items-center gap-3">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", cat.color)}>
          <CatIcon className="h-3 w-3" />
          {cat.label}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          {isLive ? `${activeParticipantCount ?? 0}/` : ""}
          {minPlayers}–{maxPlayers}
        </span>
      </div>
    </button>
  );
}

export { CATEGORY_CONFIG };
