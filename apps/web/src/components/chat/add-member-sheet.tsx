"use client";

import { useState, useEffect, useCallback } from "react";
import { useChatStore } from "@/store/chat-store";
import { api } from "@/lib/api";
import { assetUrl } from "@/lib/config";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, Loader2, Plus, Check, Search, Users } from "lucide-react";

interface Friend {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
}

interface AddMemberSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
}

export function AddMemberSheet({
  open,
  onOpenChange,
  conversationId,
}: AddMemberSheetProps) {
  const agents = useChatStore((s) => s.agents);
  const addGroupMember = useChatStore((s) => s.addGroupMember);
  const addGroupUser = useChatStore((s) => s.addGroupUser);
  const groupMembersData = useChatStore((s) => s.groupMembersData);
  const loadGroupMembersV2 = useChatStore((s) => s.loadGroupMembersV2);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const members = groupMembersData[conversationId];

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [friendsData] = await Promise.all([
        api<Friend[]>("/api/friends"),
        loadGroupMembersV2(conversationId),
      ]);
      setFriends(friendsData);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [conversationId, loadGroupMembersV2]);

  useEffect(() => {
    if (open) {
      loadData();
      setSearch("");
      setAdded(new Set());
      setError("");
    }
  }, [open, loadData]);

  // Filter out already-existing members
  const existingUserIds = new Set(members?.users.map((u) => u.userId) ?? []);
  const existingAgentIds = new Set(members?.agents.map((a) => a.agentId) ?? []);

  const availableFriends = friends.filter(
    (f) =>
      !existingUserIds.has(f.id) &&
      !added.has(`user-${f.id}`) &&
      (search === "" ||
        (f.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (f.username ?? "").toLowerCase().includes(search.toLowerCase()))
  );

  const availableAgents = agents.filter(
    (a) =>
      !existingAgentIds.has(a.id) &&
      !added.has(`agent-${a.id}`) &&
      (search === "" ||
        a.name.toLowerCase().includes(search.toLowerCase()))
  );

  const handleAddFriend = async (friendId: string) => {
    setActionLoading(`user-${friendId}`);
    setError("");
    try {
      await addGroupUser(conversationId, friendId);
      setAdded((prev) => new Set(prev).add(`user-${friendId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add user");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddAgent = async (agentId: string) => {
    setActionLoading(`agent-${agentId}`);
    setError("");
    try {
      await addGroupMember(conversationId, agentId);
      setAdded((prev) => new Set(prev).add(`agent-${agentId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add agent");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 sm:max-w-sm p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-base">Add Member</SheetTitle>
        </SheetHeader>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search friends or agents..."
              className="bg-neutral-800 border-none text-sm pl-8 h-9"
            />
          </div>
        </div>

        {error && (
          <div className="mx-4 mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="px-4 pb-4 space-y-4">
              {/* Friends Section */}
              {availableFriends.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Users className="h-3 w-3" />
                    Friends ({availableFriends.length})
                  </p>
                  <div className="space-y-1">
                    {availableFriends.map((friend) => (
                      <div
                        key={friend.id}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-accent/50 transition-colors"
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          {friend.image ? (
                            <AvatarImage src={assetUrl(friend.image)} alt={friend.name ?? ""} />
                          ) : null}
                          <AvatarFallback className="text-xs bg-neutral-700">
                            {(friend.name ?? friend.username ?? "?").charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{friend.name}</p>
                          {friend.username && (
                            <p className="text-xs text-muted-foreground truncate">@{friend.username}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          disabled={actionLoading !== null}
                          onClick={() => handleAddFriend(friend.id)}
                        >
                          {actionLoading === `user-${friend.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agents Section */}
              {availableAgents.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Bot className="h-3 w-3" />
                    My Agents ({availableAgents.length})
                  </p>
                  <div className="space-y-1">
                    {availableAgents.map((agent) => (
                      <div
                        key={agent.id}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-accent/50 transition-colors"
                      >
                        {agent.avatarUrl ? (
                          <img
                            src={assetUrl(agent.avatarUrl)}
                            alt={agent.name}
                            className="h-8 w-8 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-700">
                            <Bot className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{agent.name}</p>
                          {agent.description && (
                            <p className="text-xs text-muted-foreground truncate">{agent.description}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          disabled={actionLoading !== null}
                          onClick={() => handleAddAgent(agent.id)}
                        >
                          {actionLoading === `agent-${agent.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {availableFriends.length === 0 && availableAgents.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {search
                    ? "No matches found"
                    : "All friends and agents are already members"}
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
