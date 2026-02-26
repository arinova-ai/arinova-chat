"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { BACKEND_URL } from "@/lib/config";
import { authClient } from "@/lib/auth-client";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  Send,
  Coins,
  Users,
  Bot,
  PanelRightOpen,
  PanelRightClose,
  AlertCircle,
  AtSign,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AudioPlayer } from "@/components/chat/audio-player";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Community {
  id: string;
  creatorId: string;
  name: string;
  description: string | null;
  type: "lounge" | "hub";
  joinFee: number;
  monthlyFee: number;
  agentCallFee: number;
  status: string;
  memberCount: number;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  category: string | null;
  createdAt: string;
}

interface Member {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  subscriptionStatus: string | null;
  userName: string;
  userImage: string | null;
}

interface Agent {
  id: string;
  listingId: string;
  agentName: string;
  avatarUrl: string | null;
  description: string;
  model: string;
  addedAt: string;
}

interface Message {
  id: string;
  userId: string | null;
  agentListingId: string | null;
  content: string;
  messageType: string;
  createdAt: string;
  userName: string | null;
  userImage: string | null;
  agentName: string | null;
  ttsAudioUrl?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function CommunityDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;

  // Data
  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Chat
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  // Agent picker
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ------ Load data ------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [communityData, membersData, agentsData] = await Promise.all([
          api<Community>(`/api/communities/${id}`),
          api<{ members: Member[] }>(`/api/communities/${id}/members`),
          api<{ agents: Agent[] }>(`/api/communities/${id}/agents`),
        ]);
        if (cancelled) return;
        setCommunity(communityData);
        setMembers(membersData.members);
        setAgents(agentsData.agents);

        const userIsMember = membersData.members.some(
          (m) => m.userId === currentUserId
        );
        setIsMember(userIsMember);

        // Load messages if member
        if (userIsMember) {
          try {
            const msgData = await api<{ messages: Message[] }>(
              `/api/communities/${id}/messages?limit=50`
            );
            if (!cancelled) setMessages(msgData.messages);
          } catch {
            // may fail if not member — handled
          }
        }
      } catch {
        // auto-handled
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, currentUserId]);

  // Abort streaming on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ------ Load more messages ------

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0].createdAt;
      const data = await api<{ messages: Message[] }>(
        `/api/communities/${id}/messages?before=${encodeURIComponent(oldest)}&limit=50`
      );
      if (data.messages.length === 0) {
        setHasMore(false);
      } else {
        setMessages((prev) => [...data.messages, ...prev]);
      }
    } catch {
      // handled
    } finally {
      setLoadingMore(false);
    }
  }, [id, messages, loadingMore, hasMore]);

  // ------ Join ------

  const handleJoin = useCallback(async () => {
    setJoining(true);
    try {
      await api(`/api/communities/${id}/join`, { method: "POST" });
      setIsMember(true);
      // Refresh members + messages
      const [membersData, msgData] = await Promise.all([
        api<{ members: Member[] }>(`/api/communities/${id}/members`),
        api<{ messages: Message[] }>(`/api/communities/${id}/messages?limit=50`),
      ]);
      setMembers(membersData.members);
      setMessages(msgData.messages);
      if (community) {
        setCommunity({ ...community, memberCount: community.memberCount + 1 });
      }
    } catch {
      // handled
    } finally {
      setJoining(false);
    }
  }, [id, community]);

  // ------ Send text message ------

  const sendTextMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError(null);

    try {
      const msg = await api<Message>(`/api/communities/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: text }),
      });
      setMessages((prev) => [
        ...prev,
        {
          id: msg.id,
          userId: currentUserId ?? null,
          agentListingId: null,
          content: text,
          messageType: "text",
          createdAt: new Date().toISOString(),
          userName: session?.user?.name ?? null,
          userImage: (session?.user as Record<string, unknown>)?.image as string | null ?? null,
          agentName: null,
        },
      ]);
    } catch {
      // handled
    }
  }, [input, streaming, id, currentUserId, session]);

  // ------ Send agent message (SSE) ------

  const sendAgentMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !selectedAgent) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setInput("");
    setError(null);
    setStreaming(true);

    // Add user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      userId: currentUserId ?? null,
      agentListingId: null,
      content: text,
      messageType: "text",
      createdAt: new Date().toISOString(),
      userName: session?.user?.name ?? null,
      userImage: (session?.user as Record<string, unknown>)?.image as string | null ?? null,
      agentName: null,
    };
    setMessages((prev) => [...prev, userMsg]);

    // Add empty assistant message
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        userId: null,
        agentListingId: selectedAgent.listingId,
        content: "",
        messageType: "text",
        createdAt: new Date().toISOString(),
        userName: null,
        userImage: null,
        agentName: selectedAgent.agentName,
      },
    ]);

    const agentId = selectedAgent.listingId;
    setSelectedAgent(null);

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/communities/${id}/agent-chat`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: text,
            listingId: agentId,
          }),
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          try {
            const event = JSON.parse(jsonStr);

            if (event.type === "chunk") {
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last && last.agentListingId) {
                  copy[copy.length - 1] = {
                    ...last,
                    content: last.content + event.content,
                  };
                }
                return copy;
              });
            } else if (event.type === "audio_ready") {
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.agentListingId) {
                  copy[copy.length - 1] = { ...last, ttsAudioUrl: event.audioUrl };
                }
                return copy;
              });
            } else if (event.type === "error") {
              setError(event.message ?? "Agent error");
              // Remove empty assistant placeholder
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.agentListingId && !last.content) {
                  return prev.slice(0, -1);
                }
                return prev;
              });
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg =
        err instanceof Error ? err.message : "Failed to send message";
      setError(msg);
      // Remove empty assistant
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.agentListingId && !last.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, selectedAgent, id, currentUserId, session]);

  // ------ Send ------

  const handleSend = useCallback(() => {
    if (selectedAgent) {
      sendAgentMessage();
    } else {
      sendTextMessage();
    }
  }, [selectedAgent, sendAgentMessage, sendTextMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ------ Render ------

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-muted-foreground">
            Community not found
          </p>
          <Button
            variant="secondary"
            onClick={() => router.push("/community")}
          >
            Back to Communities
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 min-w-0">
        {/* Main chat area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Header */}
          <div className="shrink-0 border-b border-border px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => router.push("/community")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            {community.avatarUrl ? (
              <img
                src={community.avatarUrl}
                alt={community.name}
                className="h-8 w-8 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-sm font-bold text-brand-text">
                {community.name[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold truncate">
                  {community.name}
                </h2>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    community.type === "lounge"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-purple-500/15 text-purple-400"
                  )}
                >
                  {community.type === "lounge" ? "Lounge" : "Hub"}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {community.memberCount}
                </span>
                {community.agentCallFee > 0 && (
                  <span className="flex items-center gap-1">
                    <Coins className="h-3 w-3 text-yellow-500" />
                    {community.agentCallFee}/call
                  </span>
                )}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSidebarOpen((v) => !v)}
              className="hidden md:flex"
            >
              {sidebarOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {hasMore && messages.length > 0 && (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Load earlier messages"
                  )}
                </Button>
              </div>
            )}

            {messages.length === 0 && isMember && (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-2">
                <Users className="h-12 w-12 opacity-40" />
                <p className="text-sm font-medium">No messages yet</p>
                <p className="text-xs">Be the first to say something!</p>
              </div>
            )}

            {messages.map((msg) => {
              const isOwn = msg.userId === currentUserId;
              const isAgent = !!msg.agentListingId;

              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    isOwn ? "justify-end" : "justify-start"
                  )}
                >
                  <div className={cn("max-w-[80%]", isOwn ? "" : "flex gap-2")}>
                    {!isOwn && (
                      <div className="shrink-0 mt-1">
                        {isAgent ? (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500/15">
                            <Bot className="h-3.5 w-3.5 text-purple-400" />
                          </div>
                        ) : msg.userImage ? (
                          <img
                            src={msg.userImage}
                            alt=""
                            className="h-7 w-7 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/15 text-[10px] font-bold text-brand-text">
                            {(msg.userName ?? "?")[0]}
                          </div>
                        )}
                      </div>
                    )}
                    <div>
                      {!isOwn && (
                        <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">
                          {isAgent ? msg.agentName : msg.userName}
                        </p>
                      )}
                      <div
                        className={cn(
                          "rounded-2xl px-3 py-2 text-sm",
                          isOwn
                            ? "bg-brand text-white rounded-br-md"
                            : isAgent
                            ? "bg-purple-500/10 border border-purple-500/20 rounded-bl-md"
                            : "bg-card border border-border rounded-bl-md"
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {msg.content}
                        </p>
                        {msg.ttsAudioUrl && (
                          <div className="mt-1.5">
                            <AudioPlayer src={msg.ttsAudioUrl} />
                          </div>
                        )}
                        {isAgent && !msg.content && streaming && (
                          <span className="inline-flex gap-0.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse" />
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:150ms]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:300ms]" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
                {error.includes("Insufficient") && (
                  <Button
                    variant="secondary"
                    size="xs"
                    className="ml-auto"
                    onClick={() => router.push("/wallet")}
                  >
                    Top Up
                  </Button>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input / Join gate */}
          {!isMember ? (
            <div className="shrink-0 border-t border-border p-4 pb-24 md:pb-4">
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-sm font-medium">
                  Join to participate in this community
                </p>
                <p className="text-xs text-muted-foreground">
                  {community.joinFee > 0 && (
                    <span>Join fee: {community.joinFee} coins</span>
                  )}
                  {community.joinFee > 0 && community.monthlyFee > 0 && " · "}
                  {community.monthlyFee > 0 && (
                    <span>{community.monthlyFee} coins/month</span>
                  )}
                  {community.joinFee === 0 && community.monthlyFee === 0 && (
                    <span>Free to join</span>
                  )}
                </p>
                <Button
                  className="brand-gradient-btn"
                  onClick={handleJoin}
                  disabled={joining}
                >
                  {joining ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Join Community"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="shrink-0 border-t border-border p-3 pb-24 md:pb-3">
              {/* Agent picker dropdown */}
              {agentPickerOpen && agents.length > 0 && (
                <div className="mb-2 rounded-lg border border-border bg-card p-2 max-h-40 overflow-y-auto">
                  {agents.map((a) => (
                    <button
                      key={a.listingId}
                      type="button"
                      onClick={() => {
                        setSelectedAgent(a);
                        setAgentPickerOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                    >
                      <Bot className="h-4 w-4 text-purple-400 shrink-0" />
                      <span className="truncate">{a.agentName}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected agent indicator */}
              {selectedAgent && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-purple-500/10 px-3 py-1.5 text-xs">
                  <Bot className="h-3.5 w-3.5 text-purple-400" />
                  <span className="text-purple-300">
                    Messaging @{selectedAgent.agentName}
                  </span>
                  {community.agentCallFee > 0 && (
                    <span className="flex items-center gap-0.5 text-yellow-500">
                      <Coins className="h-3 w-3" />
                      {community.agentCallFee}
                    </span>
                  )}
                  <button
                    onClick={() => setSelectedAgent(null)}
                    className="ml-auto text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-end gap-2">
                {agents.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setAgentPickerOpen((v) => !v)}
                    className={cn(
                      agentPickerOpen && "bg-accent"
                    )}
                  >
                    <AtSign className="h-4 w-4" />
                  </Button>
                )}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    selectedAgent
                      ? `Message @${selectedAgent.agentName}...`
                      : "Type a message..."
                  }
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  style={{ maxHeight: 120 }}
                />
                <Button
                  size="sm"
                  className="brand-gradient-btn h-10 w-10 shrink-0 rounded-xl p-0"
                  disabled={!input.trim() || streaming}
                  onClick={handleSend}
                >
                  {streaming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          <MobileBottomNav />
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="hidden md:flex w-64 shrink-0 flex-col border-l border-border overflow-y-auto">
            {/* Members */}
            <div className="p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Members ({members.length})
              </h3>
              <div className="space-y-1.5">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    {m.userImage ? (
                      <img
                        src={m.userImage}
                        alt=""
                        className="h-6 w-6 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/15 text-[10px] font-bold text-brand-text">
                        {m.userName[0]}
                      </div>
                    )}
                    <span className="text-xs truncate flex-1">
                      {m.userName}
                    </span>
                    {m.role !== "member" && (
                      <span className="text-[10px] text-muted-foreground capitalize">
                        {m.role}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Agents */}
            {agents.length > 0 && (
              <div className="p-4 border-t border-border">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  AI Agents ({agents.length})
                </h3>
                <div className="space-y-1.5">
                  {agents.map((a) => (
                    <div key={a.id} className="flex items-center gap-2">
                      {a.avatarUrl ? (
                        <img
                          src={a.avatarUrl}
                          alt=""
                          className="h-6 w-6 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-500/15">
                          <Bot className="h-3 w-3 text-purple-400" />
                        </div>
                      )}
                      <span className="text-xs truncate flex-1">
                        {a.agentName}
                      </span>
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CommunityDetailPage() {
  return (
    <AuthGuard>
      <CommunityDetailContent />
    </AuthGuard>
  );
}
