"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import type {
  Community,
  Channel,
  ChannelMessage,
  CommunityRole,
  CommunityMember,
} from "@arinova/shared/types";
import { api } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Hash,
  Plus,
  Loader2,
  Users,
  Send,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/chat/markdown-content";

interface CommunityDetail extends Community {
  channels: Channel[];
  memberCount: number;
  membership: { role: CommunityRole } | null;
}

function CommunityContent() {
  const router = useRouter();
  const params = useParams();
  const communityId = params.id as string;

  const [community, setCommunity] = useState<CommunityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null
  );

  // Messages state
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Members state
  const [members, setMembers] = useState<CommunityMember[]>([]);

  // Create channel state
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [channelDescription, setChannelDescription] = useState("");
  const [creatingChannel, setCreatingChannel] = useState(false);

  // Leaving state
  const [leaving, setLeaving] = useState(false);

  const isOwnerOrAdmin =
    community?.membership?.role === "owner" ||
    community?.membership?.role === "admin";

  const loadCommunity = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<CommunityDetail>(
        `/api/communities/${communityId}`
      );
      setCommunity(data);
      if (data.channels.length > 0 && !selectedChannelId) {
        setSelectedChannelId(data.channels[0].id);
      }
    } catch {
      router.push("/communities");
    } finally {
      setLoading(false);
    }
  }, [communityId, router, selectedChannelId]);

  useEffect(() => {
    loadCommunity();
  }, [loadCommunity]);

  const loadMessages = useCallback(async () => {
    if (!selectedChannelId) return;
    setMessagesLoading(true);
    try {
      const data = await api<ChannelMessage[]>(
        `/api/communities/${communityId}/channels/${selectedChannelId}/messages?limit=50`
      );
      setMessages(data);
    } catch {
      // ignore
    } finally {
      setMessagesLoading(false);
    }
  }, [communityId, selectedChannelId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadMembers = useCallback(async () => {
    try {
      const data = await api<CommunityMember[]>(
        `/api/communities/${communityId}/members`
      );
      setMembers(data);
    } catch {
      // ignore
    }
  }, [communityId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedChannelId || sending) return;
    setSending(true);
    const content = messageInput.trim();
    setMessageInput("");
    try {
      const msg = await api<ChannelMessage>(
        `/api/communities/${communityId}/channels/${selectedChannelId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ content }),
        }
      );
      setMessages((prev) => [...prev, msg]);
    } catch {
      setMessageInput(content);
    } finally {
      setSending(false);
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelName.trim()) return;
    setCreatingChannel(true);
    try {
      const channel = await api<Channel>(
        `/api/communities/${communityId}/channels`,
        {
          method: "POST",
          body: JSON.stringify({
            name: channelName.trim().toLowerCase().replace(/\s+/g, "-"),
            description: channelDescription.trim() || undefined,
          }),
        }
      );
      setCommunity((prev) =>
        prev ? { ...prev, channels: [...prev.channels, channel] } : prev
      );
      setSelectedChannelId(channel.id);
      setCreateChannelOpen(false);
      setChannelName("");
      setChannelDescription("");
    } catch {
      // ignore
    } finally {
      setCreatingChannel(false);
    }
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await api(`/api/communities/${communityId}/leave`, { method: "POST" });
      router.push("/communities");
    } catch {
      setLeaving(false);
    }
  };

  const selectedChannel = community?.channels.find(
    (c) => c.id === selectedChannelId
  );

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!community) return null;

  return (
    <div className="flex h-dvh bg-background">
      {/* Channel sidebar */}
      <div className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
        {/* Community header */}
        <div className="flex h-14 shrink-0 items-center gap-2 px-4">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => router.push("/communities")}
            title="Back to communities"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold">
            {community.name}
          </h2>
          {isOwnerOrAdmin && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() =>
                router.push(`/settings`)
              }
              title="Community settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <Separator />

        {/* Member count */}
        <div className="flex items-center gap-1.5 px-4 py-2 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          {community.memberCount}{" "}
          {community.memberCount === 1 ? "member" : "members"}
        </div>

        {/* Channel list */}
        <div className="flex items-center justify-between px-4 py-1">
          <span className="text-xs font-semibold uppercase text-muted-foreground">
            Channels
          </span>
          {isOwnerOrAdmin && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setCreateChannelOpen(true)}
              title="Create channel"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-0.5 px-2 py-1">
            {community.channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => setSelectedChannelId(channel.id)}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  selectedChannelId === channel.id
                    ? "bg-neutral-700 text-foreground"
                    : "text-muted-foreground hover:bg-neutral-800 hover:text-foreground"
                )}
              >
                <Hash className="h-4 w-4 shrink-0" />
                <span className="truncate">{channel.name}</span>
              </button>
            ))}
            {community.channels.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                No channels yet.
                {isOwnerOrAdmin && " Create one to get started."}
              </p>
            )}
          </div>
        </ScrollArea>

        {/* Leave button */}
        {community.membership && community.membership.role !== "owner" && (
          <div className="shrink-0 p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-2 text-muted-foreground hover:text-destructive"
              onClick={handleLeave}
              disabled={leaving}
            >
              {leaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
              Leave Community
            </Button>
          </div>
        )}
      </div>

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {selectedChannel ? (
          <>
            {/* Channel header */}
            <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
              <Hash className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">{selectedChannel.name}</h3>
              {selectedChannel.description && (
                <>
                  <Separator orientation="vertical" className="mx-1 h-5" />
                  <span className="truncate text-sm text-muted-foreground">
                    {selectedChannel.description}
                  </span>
                </>
              )}
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1">
              <div className="px-4 py-4">
                {messagesLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-12 text-center">
                    <Hash className="mx-auto h-10 w-10 text-muted-foreground" />
                    <p className="mt-3 text-muted-foreground">
                      Welcome to #{selectedChannel.name}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This is the beginning of the channel. Send a message to
                      get started.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <div key={msg.id} className="flex gap-3">
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                            msg.role === "agent"
                              ? "bg-blue-600"
                              : "bg-neutral-600"
                          )}
                        >
                          {msg.role === "agent" ? "A" : "U"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-semibold">
                              {msg.role === "agent" ? "Agent" : "User"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(msg.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <div className="mt-0.5">
                            <MarkdownContent content={msg.content} />
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Message input */}
            <div className="shrink-0 border-t border-border p-4">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder={`Message #${selectedChannel.name}`}
                  className="flex-1 bg-neutral-800 border-none"
                  disabled={sending}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={sending || !messageInput.trim()}
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <Hash className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">
                {community.channels.length === 0
                  ? "No channels in this community yet."
                  : "Select a channel to start chatting."}
              </p>
              {isOwnerOrAdmin && community.channels.length === 0 && (
                <Button
                  className="mt-4"
                  onClick={() => setCreateChannelOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Create Channel
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Channel Dialog */}
      <Dialog open={createChannelOpen} onOpenChange={setCreateChannelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Channel</DialogTitle>
            <DialogDescription>
              Add a new channel to {community.name}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateChannel} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Name</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  placeholder="general"
                  className="bg-neutral-800 border-none pl-9"
                  required
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Description
              </label>
              <Input
                value={channelDescription}
                onChange={(e) => setChannelDescription(e.target.value)}
                placeholder="What is this channel about?"
                className="bg-neutral-800 border-none"
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={creatingChannel || !channelName.trim()}
              >
                {creatingChannel && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Create Channel
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CommunityDetailPage() {
  return (
    <AuthGuard>
      <CommunityContent />
    </AuthGuard>
  );
}
