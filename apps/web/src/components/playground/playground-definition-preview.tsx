"use client";

import type { PlaygroundDefinition } from "@arinova/shared/types";
import { Users, Swords, Trophy, Coins } from "lucide-react";
import { CATEGORY_CONFIG } from "./playground-card";
import { cn } from "@/lib/utils";

interface PlaygroundDefinitionPreviewProps {
  definition: PlaygroundDefinition;
}

export function PlaygroundDefinitionPreview({
  definition: def,
}: PlaygroundDefinitionPreviewProps) {
  const cat = CATEGORY_CONFIG[def.metadata.category] ?? CATEGORY_CONFIG.other;
  const CatIcon = cat.icon;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold">{def.metadata.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{def.metadata.description}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", cat.color)}>
            <CatIcon className="h-3 w-3" />
            {cat.label}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {def.metadata.minPlayers}–{def.metadata.maxPlayers} players
          </span>
          {def.metadata.tags?.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Roles */}
      <Section title="Roles" icon={Users}>
        <div className="grid gap-2 sm:grid-cols-2">
          {def.roles.map((role) => (
            <div
              key={role.name}
              className="rounded-lg border border-border bg-neutral-900 p-3"
            >
              <p className="font-medium text-sm">{role.name}</p>
              {role.description && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                  {role.description}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {role.minCount != null && (
                  <span className="text-[10px] text-muted-foreground">
                    min: {role.minCount}
                  </span>
                )}
                {role.maxCount != null && (
                  <span className="text-[10px] text-muted-foreground">
                    max: {role.maxCount}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Phases */}
      <Section title="Phases" icon={Swords}>
        <div className="space-y-2">
          {def.phases.map((phase, i) => (
            <div
              key={phase.name}
              className="flex items-center gap-3 rounded-lg border border-border bg-neutral-900 p-3"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-xs font-medium">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{phase.name}</p>
                {phase.description && (
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {phase.description}
                  </p>
                )}
              </div>
              {phase.duration && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {phase.duration}s
                </span>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Win Conditions */}
      <Section title="Win Conditions" icon={Trophy}>
        <div className="space-y-2">
          {def.winConditions.map((wc, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-neutral-900 p-3"
            >
              <p className="text-sm">
                <span className="font-medium">{wc.role}</span>
                {" — "}
                <span className="text-muted-foreground">{wc.description}</span>
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* Economy */}
      <Section title="Economy" icon={Coins}>
        <div className="rounded-lg border border-border bg-neutral-900 p-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <span className="text-muted-foreground">Currency:</span>{" "}
              {def.economy.currency}
            </span>
            <span>
              <span className="text-muted-foreground">Entry Fee:</span>{" "}
              {def.economy.entryFee || "Free"}
            </span>
            <span>
              <span className="text-muted-foreground">Prize:</span>{" "}
              {typeof def.economy.prizeDistribution === "string"
                ? def.economy.prizeDistribution
                : "Custom split"}
            </span>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="h-4 w-4" />
        {title}
      </h3>
      {children}
    </div>
  );
}
