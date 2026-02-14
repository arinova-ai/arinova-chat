"use client";

import { useState, useEffect } from "react";
import { useChatStore } from "@/store/chat-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Plus, Circle, Users, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DialogView = "select" | "add-agent" | "create-group";

export function NewChatDialog({ open, onOpenChange }: NewChatDialogProps) {
  const agents = useChatStore((s) => s.agents);
  const createConversation = useChatStore((s) => s.createConversation);
  const createGroupConversation = useChatStore(
    (s) => s.createGroupConversation
  );
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const agentHealth = useChatStore((s) => s.agentHealth);
  const loadAgentHealth = useChatStore((s) => s.loadAgentHealth);
  const [view, setView] = useState<DialogView>("select");

  useEffect(() => {
    if (open) {
      loadAgentHealth();
      setView("select");
    }
  }, [open, loadAgentHealth]);

  const handleSelectAgent = async (agentId: string) => {
    const conv = await createConversation(agentId);
    setActiveConversation(conv.id);
    onOpenChange(false);
  };

  if (view === "add-agent") {
    return (
      <AddAgentDialog
        open={open}
        onOpenChange={(v) => {
          if (!v) setView("select");
          onOpenChange(v);
        }}
        onBack={() => setView("select")}
      />
    );
  }

  if (view === "create-group") {
    return (
      <CreateGroupDialog
        open={open}
        onOpenChange={(v) => {
          if (!v) setView("select");
          onOpenChange(v);
        }}
        onBack={() => setView("select")}
        agents={agents}
        onCreateGroup={async (agentIds, title) => {
          const conv = await createGroupConversation(agentIds, title);
          setActiveConversation(conv.id);
          onOpenChange(false);
        }}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {agents.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No agents yet. Add one to start chatting.
            </p>
          ) : (
            agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => handleSelectAgent(agent.id)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-accent transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-700">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium">{agent.name}</p>
                    {agentHealth[agent.id] && (
                      <Circle
                        className={cn(
                          "h-2 w-2 shrink-0 fill-current",
                          agentHealth[agent.id].status === "online" &&
                            "text-green-500",
                          agentHealth[agent.id].status === "offline" &&
                            "text-neutral-500",
                          agentHealth[agent.id].status === "error" &&
                            "text-yellow-500"
                        )}
                      />
                    )}
                  </div>
                  {agent.description && (
                    <p className="truncate text-xs text-muted-foreground">
                      {agent.description}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => setView("add-agent")}
            >
              <Plus className="h-4 w-4" />
              Add Agent
            </Button>
            {agents.length >= 2 && (
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => setView("create-group")}
              >
                <Users className="h-4 w-4" />
                New Group
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateGroupDialog({
  open,
  onOpenChange,
  onBack,
  agents,
  onCreateGroup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  agents: { id: string; name: string; description: string | null }[];
  onCreateGroup: (agentIds: string[], title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggleAgent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.size < 2) {
      setError("Select at least 2 agents for a group");
      return;
    }
    if (!title.trim()) {
      setError("Group name is required");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onCreateGroup(Array.from(selectedIds), title.trim());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create group"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Group Chat</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">Group Name</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Dev Team"
              required
              className="bg-neutral-800 border-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Select Agents ({selectedIds.size} selected)
            </label>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => toggleAgent(agent.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                    selectedIds.has(agent.id)
                      ? "bg-blue-600/20 ring-1 ring-blue-600"
                      : "hover:bg-accent"
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-700">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{agent.name}</p>
                    {agent.description && (
                      <p className="truncate text-xs text-muted-foreground">
                        {agent.description}
                      </p>
                    )}
                  </div>
                  {selectedIds.has(agent.id) && (
                    <Check className="h-4 w-4 shrink-0 text-blue-400" />
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              type="submit"
              disabled={loading || selectedIds.size < 2}
              className="flex-1"
            >
              {loading ? "Creating..." : "Create Group"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddAgentDialog({
  open,
  onOpenChange,
  onBack,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
}) {
  const createAgent = useChatStore((s) => s.createAgent);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await createAgent({
        name,
        description: description || undefined,
        a2aEndpoint: endpoint,
      });
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add agent");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Agent</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CodeBot"
              required
              className="bg-neutral-800 border-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do?"
              className="bg-neutral-800 border-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">A2A Endpoint</label>
            <Input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://agent.example.com/.well-known/agent.json"
              type="url"
              required
              className="bg-neutral-800 border-none"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="flex-1"
            >
              Back
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "Adding..." : "Add Agent"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
