"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Bot, User } from "lucide-react";
import { api } from "@/lib/api";
import type { Agent } from "@arinova/shared/types";
import { cn } from "@/lib/utils";
import { assetUrl } from "@/lib/config";

export interface JoinSelection {
  agentId: string | null;
  controlMode: "human" | "agent";
}

interface AgentSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (selections: JoinSelection[]) => void;
}

export function AgentSelectDialog({
  open,
  onOpenChange,
  onSelect,
}: AgentSelectDialogProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [alsoJoinAsHuman, setAlsoJoinAsHuman] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelectedAgentId(null);
    setAlsoJoinAsHuman(false);
    api<Agent[]>("/api/agents")
      .then(setAgents)
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, [open]);

  const handleJoin = () => {
    const selections: JoinSelection[] = [];
    if (selectedAgentId) {
      if (alsoJoinAsHuman) {
        selections.push({ agentId: null, controlMode: "human" });
      }
      selections.push({ agentId: selectedAgentId, controlMode: "agent" });
    } else {
      selections.push({ agentId: null, controlMode: "human" });
    }
    onSelect(selections);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join Session</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Play as yourself or select an agent to play on your behalf.
        </p>

        <ScrollArea className="max-h-[300px]">
          <div className="space-y-2">
            {/* Play as human option */}
            <button
              onClick={() => setSelectedAgentId(null)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                selectedAgentId === null
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-neutral-600",
              )}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-700">
                <User className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">Play as Human</p>
                <p className="text-xs text-muted-foreground">
                  Control your actions manually
                </p>
              </div>
            </button>

            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    selectedAgentId === agent.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-neutral-600",
                  )}
                >
                  {agent.avatarUrl ? (
                    <img
                      src={assetUrl(agent.avatarUrl)}
                      alt={agent.name}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-700">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{agent.name}</p>
                    {agent.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {agent.description}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>

        {selectedAgentId && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={alsoJoinAsHuman}
              onChange={(e) => setAlsoJoinAsHuman(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-sm">Also join as yourself</span>
          </label>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleJoin}>
            {selectedAgentId
              ? alsoJoinAsHuman
                ? "Join Both"
                : "Join with Agent"
              : "Join as Human"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
