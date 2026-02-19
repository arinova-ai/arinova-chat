"use client";

import { useState, useEffect } from "react";
import { useChatStore } from "@/store/chat-store";
import { useSpacesStore } from "@/store/spaces-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bot, Loader2, Play } from "lucide-react";

interface JoinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  sessionId: string;
}

export function JoinDialog({
  open,
  onOpenChange,
  spaceId,
  sessionId,
}: JoinDialogProps) {
  const agents = useChatStore((s) => s.agents);
  const loadAgents = useChatStore((s) => s.loadAgents);
  const joinSession = useSpacesStore((s) => s.joinSession);

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (open) {
      loadAgents();
      setSelectedAgentId(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleJoin = async () => {
    setJoining(true);
    try {
      await joinSession(spaceId, sessionId, selectedAgentId ?? undefined);
      onOpenChange(false);
    } finally {
      setJoining(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join Session</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Optionally select an agent to bring into this session.
          </p>

          <div className="max-h-60 space-y-2 overflow-y-auto">
            {/* No agent option */}
            <button
              onClick={() => setSelectedAgentId(null)}
              className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                selectedAgentId === null
                  ? "border-white bg-neutral-800"
                  : "border-neutral-800 hover:border-neutral-700"
              }`}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-700">
                <Play className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">Join without agent</p>
                <p className="text-xs text-muted-foreground">
                  Participate as yourself
                </p>
              </div>
            </button>

            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id)}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  selectedAgentId === agent.id
                    ? "border-white bg-neutral-800"
                    : "border-neutral-800 hover:border-neutral-700"
                }`}
              >
                {agent.avatarUrl ? (
                  <img
                    src={agent.avatarUrl}
                    alt={agent.name}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-700">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{agent.name}</p>
                  {agent.description && (
                    <p className="truncate text-xs text-muted-foreground">
                      {agent.description}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>

          <Button
            className="w-full gap-2"
            onClick={handleJoin}
            disabled={joining}
          >
            {joining ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Join Session
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
