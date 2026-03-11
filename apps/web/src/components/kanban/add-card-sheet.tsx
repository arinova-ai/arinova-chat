"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { PRIORITY_CONFIG } from "./types";

interface AddCardSheetProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; description: string; priority: string; agentIds: string[] }) => void;
  streamAgents: { id: string; name: string; emoji: string }[];
}

export function AddCardSheet({ open, onClose, onSubmit, streamAgents }: AddCardSheetProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), description: description.trim(), priority, agentIds: [...selectedAgents] });
    setTitle("");
    setDescription("");
    setPriority("medium");
    setSelectedAgents(new Set());
  };

  const toggleAgent = (id: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-80 sm:w-96 border-border bg-background">
        <SheetHeader>
          <SheetTitle>New Card</SheetTitle>
          <SheetDescription className="sr-only">Create a new kanban card</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 px-1">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title..."
              className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details..."
              rows={3}
              className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand resize-none"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Priority</label>
            <div className="mt-1 flex gap-1.5">
              {(["low", "medium", "high", "urgent"] as const).map((p) => {
                const cfg = PRIORITY_CONFIG[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      priority === p
                        ? `${cfg.bg} ${cfg.color} ring-1 ring-current`
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Assign Agents */}
          {streamAgents.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Assign Agents</label>
              <div className="mt-1 space-y-1">
                {streamAgents.filter((a) => a.id && !a.id.startsWith("empty-")).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAgent(a.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                      selectedAgents.has(a.id)
                        ? "bg-brand/15 text-brand-text"
                        : "text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <span className="text-base">{a.emoji}</span>
                    <span className="flex-1 truncate">{a.name}</span>
                    {selectedAgents.has(a.id) && <span className="text-brand-text text-xs">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Card
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
