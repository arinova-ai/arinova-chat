"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Zap } from "lucide-react";
import { playgroundWs } from "@/lib/playground-ws";
import type {
  PlaygroundActionDefinition,
  PlaygroundParticipant,
} from "@arinova/shared/types";

interface ActionPanelProps {
  actions: PlaygroundActionDefinition[];
  currentPhase: string | null;
  myRole: string | null;
  participants: PlaygroundParticipant[];
  myParticipantId: string | null;
}

export function ActionPanel({
  actions,
  currentPhase,
  myRole,
  participants,
  myParticipantId,
}: ActionPanelProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, Record<string, string>>>({});

  // Filter actions available to current role and phase
  const availableActions = actions.filter((action) => {
    if (action.phases && currentPhase && !action.phases.includes(currentPhase)) {
      return false;
    }
    if (action.roles && myRole && !action.roles.includes(myRole)) {
      return false;
    }
    return true;
  });

  const otherParticipants = participants.filter((p) => p.id !== myParticipantId);

  const handleAction = (actionName: string) => {
    setActionLoading(actionName);
    const actionParams = params[actionName];
    const cleanParams: Record<string, unknown> = {};

    if (actionParams) {
      for (const [key, value] of Object.entries(actionParams)) {
        if (value) cleanParams[key] = value;
      }
    }

    playgroundWs.send({
      type: "pg_action",
      actionName,
      params: Object.keys(cleanParams).length > 0 ? cleanParams : undefined,
    });

    // Clear loading after a short delay (actual result comes via WS)
    setTimeout(() => setActionLoading(null), 1000);
  };

  const setParam = (actionName: string, paramName: string, value: string) => {
    setParams((prev) => ({
      ...prev,
      [actionName]: { ...prev[actionName], [paramName]: value },
    }));
  };

  if (availableActions.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-neutral-900 p-4 text-center">
        <p className="text-sm text-muted-foreground">
          No actions available in this phase
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Zap className="h-4 w-4" />
        Actions
      </h3>

      {availableActions.map((action) => {
        const actionDef = action;
        const hasTargetParam = actionDef.targetType === "player";
        const schemaParams = actionDef.params
          ? Object.entries(actionDef.params).filter(
              ([key]) => key !== "type" && key !== "properties",
            )
          : [];

        // Extract properties from JSON Schema params
        const paramProperties =
          actionDef.params && typeof actionDef.params === "object" && "properties" in actionDef.params
            ? Object.entries(
                actionDef.params.properties as Record<string, { type?: string; description?: string }>,
              )
            : [];

        return (
          <div
            key={action.name}
            className="rounded-lg border border-border bg-neutral-900 p-3"
          >
            <div className="mb-2">
              <p className="text-sm font-medium">{action.name}</p>
              {action.description && (
                <p className="text-xs text-muted-foreground">{action.description}</p>
              )}
            </div>

            {/* Target player selector */}
            {hasTargetParam && otherParticipants.length > 0 && (
              <div className="mb-2">
                <Select
                  value={params[action.name]?.target ?? ""}
                  onValueChange={(v) => setParam(action.name, "target", v)}
                >
                  <SelectTrigger className="h-8 bg-neutral-800 border-none text-sm">
                    <SelectValue placeholder="Select target player" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherParticipants.map((p, i) => (
                      <SelectItem key={p.id} value={p.id}>
                        Player {participants.indexOf(p) + 1}
                        {p.role ? ` (${p.role})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Parameter inputs from JSON Schema */}
            {paramProperties.map(([paramName, schema]) => (
              <div key={paramName} className="mb-2">
                <Input
                  placeholder={schema.description ?? paramName}
                  value={params[action.name]?.[paramName] ?? ""}
                  onChange={(e) => setParam(action.name, paramName, e.target.value)}
                  className="h-8 bg-neutral-800 border-none text-sm"
                />
              </div>
            ))}

            <Button
              size="sm"
              className="w-full gap-2"
              onClick={() => handleAction(action.name)}
              disabled={actionLoading === action.name}
            >
              {actionLoading === action.name ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              {action.name}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
