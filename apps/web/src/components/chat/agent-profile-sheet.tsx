"use client";

import { useState, useCallback, useEffect } from "react";
import { useChatStore } from "@/store/chat-store";
import { assetUrl, AGENT_DEFAULT_AVATAR } from "@/lib/config";
import { api } from "@/lib/api";
import type { Agent } from "@arinova/shared/types";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, User, Pencil, Check, X, MessageSquare } from "lucide-react";
import { VisuallyHidden } from "radix-ui";
import { authClient } from "@/lib/auth-client";

interface AgentProfileSheetProps {
  agentId: string;
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Resolved agent data from any available source */
interface ResolvedAgent {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  ownerId: string | null;
}

export function AgentProfileSheet({
  agentId,
  conversationId,
  open,
  onOpenChange,
}: AgentProfileSheetProps) {
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;

  // Data sources
  const storeAgents = useChatStore((s) => s.agents);
  const groupMembersData = useChatStore((s) => s.groupMembersData);
  const conversations = useChatStore((s) => s.conversations);
  const thinkingAgents = useChatStore((s) => s.thinkingAgents);
  const loadAgents = useChatStore((s) => s.loadAgents);

  // Resolve agent data from multiple sources
  const ownAgent = storeAgents.find((a) => a.id === agentId);
  const groupMembers = groupMembersData[conversationId];
  const groupAgent = groupMembers?.agents.find((a) => a.agentId === agentId);
  const conv = conversations.find((c) => c.agentId === agentId);
  const groupOwner = groupAgent?.ownerUserId
    ? groupMembers?.users.find((u) => u.userId === groupAgent.ownerUserId)
    : undefined;

  const resolved: ResolvedAgent | null = ownAgent
    ? {
        id: ownAgent.id,
        name: ownAgent.name,
        description: ownAgent.description,
        avatarUrl: ownAgent.avatarUrl,
        ownerId: ownAgent.ownerId,
      }
    : groupAgent
      ? {
          id: groupAgent.agentId,
          name: groupAgent.agentName,
          description: groupAgent.agentDescription,
          avatarUrl: groupAgent.agentAvatarUrl,
          ownerId: groupAgent.ownerUserId,
        }
      : conv
        ? {
            id: agentId,
            name: conv.agentName,
            description: conv.agentDescription,
            avatarUrl: conv.agentAvatarUrl,
            ownerId: null,
          }
        : null;

  const isOwner = !!(currentUserId && resolved?.ownerId && currentUserId === resolved.ownerId);

  // Is agent currently thinking in any conversation?
  const isThinking = Object.values(thinkingAgents).some((arr) =>
    arr.some((ta) => ta.agentId === agentId)
  );

  // Conversations that include this agent
  const agentConversations = conversations.filter((c) => c.agentId === agentId);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset edit state when sheet closes
  useEffect(() => {
    if (!open) setEditing(false);
  }, [open]);

  const handleStartEdit = useCallback(() => {
    if (!resolved) return;
    setEditName(resolved.name);
    setEditDesc(resolved.description ?? "");
    setEditing(true);
  }, [resolved]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!resolved) return;
    const trimmedName = editName.trim();
    if (!trimmedName) return;
    setSaving(true);
    try {
      await api<Agent>(`/api/agents/${resolved.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: trimmedName,
          description: editDesc.trim() || null,
        }),
      });
      // Refresh store
      await loadAgents();
      setEditing(false);
    } catch {
      // API error — toast handled by api()
    } finally {
      setSaving(false);
    }
  }, [resolved, editName, editDesc, loadAgents]);

  if (!resolved) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="rounded-t-2xl border-border bg-secondary px-4 pb-6 pt-3"
      >
        <VisuallyHidden.Root>
          <SheetTitle>Agent profile</SheetTitle>
        </VisuallyHidden.Root>

        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted" />

        {/* Agent header */}
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <img
              src={resolved.avatarUrl ? assetUrl(resolved.avatarUrl) : AGENT_DEFAULT_AVATAR}
              alt={resolved.name}
              className="h-14 w-14 rounded-full object-cover"
            />
            {/* Status dot */}
            <span
              className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-secondary ${
                isThinking ? "bg-green-500" : "bg-emerald-500"
              }`}
              title={isThinking ? "Working" : "Online"}
            />
          </div>
          <div className="min-w-0 flex-1">
            {editing ? (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8 text-base font-semibold bg-accent border-border"
                autoFocus
              />
            ) : (
              <p className="text-base font-semibold text-foreground truncate">
                {resolved.name}
              </p>
            )}
            <span className={`inline-flex items-center gap-1.5 text-xs ${
              isThinking ? "text-green-400" : "text-emerald-400"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${
                isThinking ? "bg-green-400 animate-pulse" : "bg-emerald-400"
              }`} />
              {isThinking ? "Working" : "Online"}
            </span>
          </div>
          {isOwner && !editing && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleStartEdit}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              title="Edit agent"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Description */}
        <div className="mt-4">
          {editing ? (
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Agent description..."
              rows={3}
              className="w-full rounded-lg border border-border bg-accent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          ) : resolved.description ? (
            <p className="text-sm text-muted-foreground">{resolved.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground/50 italic">No description</p>
          )}
        </div>

        {/* Edit actions */}
        {editing && (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={handleSaveEdit}
              disabled={saving || !editName.trim()}
              className="gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelEdit}
              disabled={saving}
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        )}

        {/* Conversations */}
        {agentConversations.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Conversations
            </p>
            <div className="space-y-1">
              {agentConversations.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 bg-accent/40"
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-sm text-foreground truncate">
                    {c.title ?? c.agentName}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Owner section (for non-owner viewing) */}
        {!isOwner && groupOwner && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Owner
            </p>
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 bg-accent/40">
              <Avatar className="h-8 w-8 shrink-0">
                {groupOwner.image ? (
                  <AvatarImage src={assetUrl(groupOwner.image)} alt={groupOwner.name ?? groupOwner.username ?? ""} />
                ) : null}
                <AvatarFallback className="text-xs bg-muted">
                  {(groupOwner.name ?? groupOwner.username ?? "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {groupOwner.name}
                </p>
                {groupOwner.username && (
                  <p className="text-xs text-muted-foreground truncate">@{groupOwner.username}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
