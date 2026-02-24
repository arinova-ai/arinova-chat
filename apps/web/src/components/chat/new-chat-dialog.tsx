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
import { Bot, Plus, Circle, Users, Check, Copy, ChevronDown, ChevronUp, Settings, UserPlus, Loader2, ArrowLeft, User } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BotManageDialog } from "./bot-manage-dialog";
import type { Agent } from "@arinova/shared/types";
import { assetUrl } from "@/lib/config";

interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DialogView = "select" | "add-agent" | "create-group" | "friend";

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
  const [managingAgent, setManagingAgent] = useState<Agent | null>(null);

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
        onCreateGroup={async (agentIds, title, userIds) => {
          const conv = await createGroupConversation(agentIds, title, userIds);
          setActiveConversation(conv.id);
          onOpenChange(false);
        }}
      />
    );
  }

  if (view === "friend") {
    return (
      <FriendDmDialog
        open={open}
        onOpenChange={(v) => {
          if (!v) setView("select");
          onOpenChange(v);
        }}
        onBack={() => setView("select")}
        onSelect={async (friendUserId) => {
          const createDm = useChatStore.getState().createDirectConversation;
          const conv = await createDm(friendUserId);
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
              <div key={agent.id} className="flex items-center gap-1">
                <button
                  onClick={() => handleSelectAgent(agent.id)}
                  className="flex flex-1 items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-accent transition-colors"
                >
                  {agent.avatarUrl ? (
                    <img
                      src={assetUrl(agent.avatarUrl)}
                      alt={agent.name}
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent">
                      <Bot className="h-5 w-5" />
                    </div>
                  )}
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
                              "text-muted-foreground",
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setManagingAgent(agent);
                  }}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => setView("add-agent")}
            >
              <Plus className="h-4 w-4" />
              Create Bot
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => setView("create-group")}
            >
              <Users className="h-4 w-4" />
              New Group
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => setView("friend")}
            >
              <User className="h-4 w-4" />
              Friend
            </Button>
          </div>
        </div>
      </DialogContent>

      {managingAgent && (
        <BotManageDialog
          agent={managingAgent}
          open={!!managingAgent}
          onOpenChange={(v) => {
            if (!v) setManagingAgent(null);
          }}
        />
      )}
    </Dialog>
  );
}

interface FriendItem {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
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
  agents: { id: string; name: string; description: string | null; avatarUrl: string | null }[];
  onCreateGroup: (agentIds: string[], title: string, userIds?: string[]) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showFriends, setShowFriends] = useState(false);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);

  useEffect(() => {
    if (showFriends && friends.length === 0) {
      setFriendsLoading(true);
      api<FriendItem[]>("/api/friends")
        .then(setFriends)
        .catch(() => {})
        .finally(() => setFriendsLoading(false));
    }
  }, [showFriends, friends.length]);

  const toggleAgent = (id: string) => {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedAgentIds.size < 1 && selectedUserIds.size < 1) {
      setError("Select at least 1 agent or 1 friend");
      return;
    }
    if (!title.trim()) {
      setError("Group name is required");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const userIds = selectedUserIds.size > 0 ? Array.from(selectedUserIds) : undefined;
      await onCreateGroup(Array.from(selectedAgentIds), title.trim(), userIds);
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
              className="bg-secondary border-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Select Agents ({selectedAgentIds.size} selected)
            </label>
            <div className="max-h-36 space-y-1 overflow-y-auto">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => toggleAgent(agent.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                    selectedAgentIds.has(agent.id)
                      ? "bg-blue-600/20 ring-1 ring-blue-600"
                      : "hover:bg-accent"
                  )}
                >
                  {agent.avatarUrl ? (
                    <img
                      src={assetUrl(agent.avatarUrl)}
                      alt={agent.name}
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{agent.name}</p>
                    {agent.description && (
                      <p className="truncate text-xs text-muted-foreground">
                        {agent.description}
                      </p>
                    )}
                  </div>
                  {selectedAgentIds.has(agent.id) && (
                    <Check className="h-4 w-4 shrink-0 text-blue-400" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Add Friends Section */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowFriends(!showFriends)}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add Friends
              {selectedUserIds.size > 0 && (
                <span className="text-xs text-blue-400">({selectedUserIds.size} selected)</span>
              )}
              {showFriends ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showFriends && (
              <div className="max-h-36 space-y-1 overflow-y-auto">
                {friendsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : friends.length === 0 ? (
                  <p className="py-3 text-center text-xs text-muted-foreground">
                    No friends yet
                  </p>
                ) : (
                  friends.map((friend) => (
                    <button
                      key={friend.id}
                      type="button"
                      onClick={() => toggleUser(friend.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                        selectedUserIds.has(friend.id)
                          ? "bg-blue-600/20 ring-1 ring-blue-600"
                          : "hover:bg-accent"
                      )}
                    >
                      {friend.image ? (
                        <img
                          src={assetUrl(friend.image)}
                          alt={friend.username ?? ""}
                          className="h-8 w-8 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium">
                          {(friend.name ?? friend.username ?? "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {friend.name ?? friend.username ?? "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          @{friend.username ?? "unknown"}
                        </p>
                      </div>
                      {selectedUserIds.has(friend.id) && (
                        <Check className="h-4 w-4 shrink-0 text-blue-400" />
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
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
              disabled={loading || (selectedAgentIds.size < 1 && selectedUserIds.size < 1)}
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
  const createConversation = useChatStore((s) => s.createConversation);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdAgent, setCreatedAgent] = useState<{
    id: string;
    name: string;
    secretToken: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const agent = await createAgent({
        name,
        description: description || undefined,
        a2aEndpoint: endpoint || undefined,
      });
      setCreatedAgent({ id: agent.id, name: agent.name, secretToken: agent.secretToken });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create bot");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!createdAgent) return;
    await navigator.clipboard.writeText(createdAgent.secretToken ?? createdAgent.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Success state — show pairing code and instructions
  if (createdAgent) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bot Created</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg bg-green-500/10 px-4 py-3">
              <Check className="h-5 w-5 text-green-500 shrink-0" />
              <p className="text-sm">
                <span className="font-medium">{createdAgent.name}</span> has
                been created successfully.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Bot Token</label>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 rounded-lg bg-secondary px-3 py-2 text-xs font-mono truncate select-all">
                  {createdAgent.secretToken ?? createdAgent.id}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="rounded-lg bg-secondary/50 px-4 py-3 text-sm text-muted-foreground space-y-3">
              <p className="font-medium text-foreground">Next steps:</p>
              <p>
                Use this bot token to connect your AI agent via OpenClaw.
              </p>
              <pre className="rounded-md bg-card px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre">{`openclaw arinova-setup --token ${createdAgent.secretToken ?? "<bot-token>"}`}</pre>
            </div>

            <Button
              onClick={async () => {
                const conv = await createConversation(createdAgent.id);
                setActiveConversation(conv.id);
                onOpenChange(false);
              }}
              className="w-full"
            >
              Start Chat
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Bot</DialogTitle>
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
              className="bg-secondary border-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do?"
              className="bg-secondary border-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            Advanced: Connect existing agent
          </button>

          {showAdvanced && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                A2A Endpoint{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>
              <Input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://agent.example.com/.well-known/agent.json"
                type="url"
                className="bg-secondary border-none"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to create a bot first, then connect an agent later.
              </p>
            </div>
          )}

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
              {loading ? "Creating..." : "Create Bot"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FriendDmDialog({
  open,
  onOpenChange,
  onBack,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  onSelect: (friendUserId: string) => Promise<void>;
}) {
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLoading(true);
      api<FriendItem[]>("/api/friends")
        .then(setFriends)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open]);

  const handleSelect = async (friendId: string) => {
    setSelecting(friendId);
    try {
      await onSelect(friendId);
    } catch {
      setSelecting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chat with Friend</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : friends.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No friends yet. Add friends first to start a conversation.
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {friends.map((friend) => (
                <button
                  key={friend.id}
                  onClick={() => handleSelect(friend.id)}
                  disabled={selecting !== null}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {friend.image ? (
                    <img
                      src={assetUrl(friend.image)}
                      alt={friend.username ?? ""}
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-medium">
                      {(friend.name ?? friend.username ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {friend.name ?? friend.username ?? "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      @{friend.username ?? "unknown"}
                    </p>
                  </div>
                  {selecting === friend.id && (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={onBack}
          >
            Back
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

