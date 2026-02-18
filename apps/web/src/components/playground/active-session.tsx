"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Clock,
  Users,
  Send,
  Bot,
  User,
  Shield,
} from "lucide-react";
import { ActionPanel } from "./action-panel";
import { playgroundWs } from "@/lib/playground-ws";
import type {
  PlaygroundDefinition,
  PlaygroundParticipant,
} from "@arinova/shared/types";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/store/toast-store";

interface ChatMessage {
  participantId: string;
  content: string;
  timestamp: number;
}

interface ActiveSessionProps {
  playgroundId: string;
  sessionId: string;
  state: Record<string, unknown>;
  currentPhase: string | null;
  participants: PlaygroundParticipant[];
  myParticipantId: string | null;
  myRole: string | null;
  definition: PlaygroundDefinition;
}

export function ActiveSession({
  playgroundId,
  sessionId,
  state,
  currentPhase,
  participants,
  myParticipantId,
  myRole,
  definition,
}: ActiveSessionProps) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const addToast = useToastStore((s) => s.addToast);

  // Find current phase definition
  const phaseDef = definition.phases.find((p) => p.name === currentPhase);

  // Timer state for phase duration
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!phaseDef?.duration) {
      setTimeLeft(null);
      return;
    }
    setTimeLeft(phaseDef.duration);
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [currentPhase, phaseDef?.duration]);

  // Listen for chat messages and phase transitions
  useEffect(() => {
    const unsub = playgroundWs.subscribe((event) => {
      if (event.type === "pg_chat") {
        setChatMessages((prev) => [
          ...prev,
          {
            participantId: event.participantId,
            content: event.content,
            timestamp: Date.now(),
          },
        ]);
      } else if (event.type === "pg_phase_transition") {
        addToast(`Phase: ${event.from} → ${event.to}`, "info");
      } else if (event.type === "pg_action_result") {
        if (!event.success) {
          addToast(event.error ?? "Action failed", "error");
        }
      }
    });
    return unsub;
  }, [addToast]);

  // Auto-scroll chat
  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatMessages]);

  const handleSendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    playgroundWs.send({ type: "pg_chat", content: text });
    setChatInput("");
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const getParticipantLabel = (participantId: string) => {
    const idx = participants.findIndex((p) => p.id === participantId);
    if (idx === -1) return "Unknown";
    const p = participants[idx];
    const label = `Player ${idx + 1}`;
    return p.id === myParticipantId ? `${label} (you)` : label;
  };

  // State entries to display (simple key-value rendering)
  const stateEntries = Object.entries(state).filter(
    ([key]) => !key.startsWith("_") && key !== "winners",
  );

  return (
    <div className="flex h-full flex-col gap-4 lg:flex-row">
      {/* Main area */}
      <div className="flex flex-1 flex-col gap-4 min-w-0">
        {/* Phase & Timer bar */}
        <div className="flex items-center gap-3 rounded-lg bg-neutral-800 px-4 py-3">
          <Shield className="h-4 w-4 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              Phase: <span className="text-primary">{currentPhase ?? "—"}</span>
            </p>
            {phaseDef?.description && (
              <p className="text-xs text-muted-foreground">{phaseDef.description}</p>
            )}
          </div>
          {myRole && (
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
              {myRole}
            </span>
          )}
          {timeLeft !== null && (
            <div className="flex items-center gap-1 text-sm font-mono">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className={cn(timeLeft <= 10 && "text-red-400")}>
                {formatTime(timeLeft)}
              </span>
            </div>
          )}
        </div>

        {/* Game State */}
        {stateEntries.length > 0 && (
          <div className="rounded-lg border border-border bg-neutral-900 p-4">
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">
              Game State
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {stateEntries.map(([key, value]) => (
                <div key={key} className="text-sm">
                  <span className="text-muted-foreground">{key}:</span>{" "}
                  <span className="font-medium">
                    {typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Panel */}
        <ActionPanel
          actions={definition.actions}
          currentPhase={currentPhase}
          myRole={myRole}
          participants={participants}
          myParticipantId={myParticipantId}
        />

        {/* Chat */}
        <div className="flex flex-1 flex-col rounded-lg border border-border bg-neutral-900">
          <div
            ref={chatScrollRef}
            className="flex-1 space-y-2 overflow-y-auto p-3"
            style={{ minHeight: "120px", maxHeight: "250px" }}
          >
            {chatMessages.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-4">
                No messages yet
              </p>
            )}
            {chatMessages.map((msg, i) => {
              const isMe = msg.participantId === myParticipantId;
              return (
                <div
                  key={i}
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-1.5 text-sm",
                    isMe
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "mr-auto bg-neutral-800",
                  )}
                >
                  {!isMe && (
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">
                      {getParticipantLabel(msg.participantId)}
                    </p>
                  )}
                  {msg.content}
                </div>
              );
            })}
          </div>
          <div className="border-t border-border p-2">
            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChat();
                  }
                }}
                placeholder="Send a message..."
                className="h-8 bg-neutral-800 border-none text-sm"
              />
              <Button
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleSendChat}
                disabled={!chatInput.trim()}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar — Participant list */}
      <div className="w-full shrink-0 lg:w-56">
        <div className="rounded-lg border border-border bg-neutral-900 p-3">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Users className="h-4 w-4" />
            Players ({participants.length})
          </h3>
          <div className="space-y-2">
            {participants.map((p, i) => (
              <div
                key={p.id}
                className={cn(
                  "flex items-center gap-2 rounded-md p-2",
                  p.id === myParticipantId && "bg-neutral-800",
                )}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-700">
                  {p.agentId ? (
                    <Bot className="h-3 w-3" />
                  ) : (
                    <User className="h-3 w-3" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">
                    P{i + 1}
                    {p.id === myParticipantId ? " (you)" : ""}
                  </p>
                  {p.role && (
                    <p className="text-[10px] text-muted-foreground">{p.role}</p>
                  )}
                </div>
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    p.isConnected ? "bg-green-400" : "bg-neutral-600",
                  )}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
