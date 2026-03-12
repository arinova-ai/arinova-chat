"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { assetUrl, AGENT_DEFAULT_AVATAR } from "@/lib/config";
import { useChatStore, type GroupMembers } from "@/store/chat-store";
import { authClient } from "@/lib/auth-client";
import { ArrowLeft, MessageSquare, Phone, Radio } from "lucide-react";
import { ArinovaSpinner } from "@/components/ui/arinova-spinner";
import { useTranslation } from "@/lib/i18n";
import { useVoiceCallStore } from "@/store/voice-call-store";
import { cn } from "@/lib/utils";

/** Public agent profile returned by /api/agents/:id/profile */
interface AgentProfile {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  ownerId: string;
  isPublic: boolean;
  category: string | null;
  usageCount: number;
  voiceCapable: boolean;
  createdAt: string;
}

interface AgentStats {
  totalMessages: number;
  totalConversations: number;
  lastActive: string | null;
}

const LISTEN_MODES = ["all", "all_mentions", "owner_unmention_others_mention", "owner_and_allowlist", "owner_only", "muted"] as const;
type ListenMode = (typeof LISTEN_MODES)[number];

function AgentProfileContent() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentId = params.id as string;
  const convId = searchParams.get("convId");

  const { data: session } = authClient.useSession();
  const agentHealth = useChatStore((s) => s.agentHealth);
  const conversations = useChatStore((s) => s.conversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const updateAgentListenMode = useChatStore((s) => s.updateAgentListenMode);
  const setAgentAllowedUsers = useChatStore((s) => s.setAgentAllowedUsers);

  const voiceCallState = useVoiceCallStore((s) => s.callState);
  const startCall = useVoiceCallStore((s) => s.startCall);
  const isInCall = voiceCallState !== "idle";

  const health = agentHealth[agentId];
  const isOnline = health?.status === "online";

  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownerName, setOwnerName] = useState<string | null>(null);

  // Listen mode state (group context only)
  const [groupMembers, setGroupMembers] = useState<GroupMembers | null>(null);
  const [listenMode, setListenMode] = useState<ListenMode>("all_mentions");
  const [allowedUserIds, setAllowedUserIds] = useState<Set<string>>(new Set());
  const [listenModeLoading, setListenModeLoading] = useState(false);

  const isOwner = !!(
    session?.user?.id &&
    agent?.ownerId &&
    session.user.id === agent.ownerId
  );

  // Fetch agent profile (public endpoint — works for any authenticated user)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<AgentProfile>(`/api/agents/${agentId}/profile`)
      .then((data) => {
        if (!cancelled) setAgent(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  // Fetch stats (owner-only — silently fails for non-owners)
  useEffect(() => {
    if (!agent) return;
    let cancelled = false;
    api<AgentStats>(`/api/agents/${agentId}/stats`, { silent: true })
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [agentId, agent]);

  // Fetch owner name
  useEffect(() => {
    if (!agent?.ownerId) return;
    if (session?.user?.id === agent.ownerId) {
      setOwnerName(session.user.name ?? null);
      return;
    }
    let cancelled = false;
    api<{ id: string; name: string }>(`/api/users/${agent.ownerId}`)
      .then((data) => {
        if (!cancelled) setOwnerName(data.name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [agent?.ownerId, session?.user?.id, session?.user?.name]);

  // Load group members for listen mode (when navigated from group)
  useEffect(() => {
    if (!convId) return;
    let cancelled = false;
    api<GroupMembers>(`/api/conversations/${convId}/members`, { silent: true })
      .then((data) => {
        if (cancelled) return;
        setGroupMembers(data);
        const agentMember = data.agents.find((a) => a.agentId === agentId);
        if (agentMember) {
          setListenMode(agentMember.listenMode as ListenMode);
        }
      })
      .catch(() => {});
    // Also load allowed users
    api<{ userIds: string[] }>(`/api/conversations/${convId}/agents/${agentId}/allowed-users`, { silent: true })
      .then((data) => {
        if (!cancelled && data?.userIds) {
          setAllowedUserIds(new Set(data.userIds));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [convId, agentId]);

  const isAgentOwner = !!(
    session?.user?.id &&
    agent?.ownerId &&
    session.user.id === agent.ownerId
  );

  const handleListenModeChange = useCallback(async (mode: ListenMode) => {
    if (!convId) return;
    setListenModeLoading(true);
    try {
      await updateAgentListenMode(convId, agentId, mode);
      setListenMode(mode);
    } catch { /* ignore */ }
    finally { setListenModeLoading(false); }
  }, [convId, agentId, updateAgentListenMode]);

  const handleToggleAllowedUser = useCallback(async (userId: string) => {
    if (!convId) return;
    const next = new Set(allowedUserIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setAllowedUserIds(next);
    try {
      await setAgentAllowedUsers(convId, agentId, [...next]);
    } catch { /* revert on error */
      setAllowedUserIds(allowedUserIds);
    }
  }, [convId, agentId, allowedUserIds, setAgentAllowedUsers]);

  const handleChat = useCallback(async () => {
    if (!agent) return;
    const existing = conversations.find(
      (c) => c.agentId === agentId && (c.type === "h2a" || c.type === "direct")
    );
    if (existing) {
      setActiveConversation(existing.id);
    } else {
      const conv = await createConversation(agentId);
      setActiveConversation(conv.id);
    }
    router.push("/");
  }, [
    agent,
    agentId,
    conversations,
    setActiveConversation,
    createConversation,
    router,
  ]);

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => router.back()}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-base font-semibold">
              {t("profilePage.agentProfile")}
            </h1>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-6">
            {loading && (
              <div className="flex justify-center py-16">
                <ArinovaSpinner />
              </div>
            )}

            {!loading && !agent && (
              <p className="text-center text-sm text-muted-foreground py-16">
                {t("profilePage.agentNotFound")}
              </p>
            )}

            {agent && (
              <>
                {/* Agent card */}
                <div className="flex flex-col items-center text-center">
                  <div className="relative">
                    <img
                      src={
                        agent.avatarUrl
                          ? assetUrl(agent.avatarUrl)
                          : AGENT_DEFAULT_AVATAR
                      }
                      alt={agent.name}
                      className="h-20 w-20 rounded-full object-cover"
                    />
                    <span
                      className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-background ${
                        isOnline ? "bg-emerald-500" : "bg-zinc-500"
                      }`}
                    />
                  </div>

                  <h2 className="mt-3 text-lg font-semibold text-foreground">
                    {agent.name}
                  </h2>

                  {/* Status badge */}
                  <span
                    className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      isOnline
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-zinc-500/15 text-zinc-400"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isOnline ? "bg-emerald-400" : "bg-zinc-400"
                      }`}
                    />
                    {isOnline
                      ? t("profilePage.online")
                      : t("profilePage.offline")}
                  </span>

                  {agent.description && (
                    <p className="mt-3 text-sm text-muted-foreground max-w-md">
                      {agent.description}
                    </p>
                  )}

                  {/* Action buttons */}
                  {(() => {
                    const directConv = conversations.find(
                      (c) => c.agentId === agentId && (c.type === "h2a" || c.type === "direct")
                    );
                    return (
                      <div className="mt-4 flex items-center gap-2">
                        <Button className="gap-2" onClick={handleChat}>
                          <MessageSquare className="h-4 w-4" />
                          {t("profilePage.chat")}
                        </Button>
                        {directConv && (
                          <Button
                            variant="outline"
                            size="icon"
                            className={cn(isInCall && "text-green-400")}
                            onClick={() => {
                              if (!isInCall) {
                                startCall(
                                  directConv.id,
                                  { agentId },
                                  agent.name,
                                  agent.avatarUrl,
                                  "native"
                                );
                              }
                            }}
                            disabled={isInCall}
                            title={isInCall ? t("voice.inCall") : t("voice.startCall")}
                          >
                            <Phone className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Info section */}
                <div className="mt-8 space-y-3">
                  {/* Owner */}
                  {ownerName && (
                    <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-4 py-3">
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">
                        {t("profilePage.owner")}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          agent.ownerId &&
                          router.push(`/profile/${agent.ownerId}`)
                        }
                        className="text-sm font-medium text-foreground hover:underline"
                      >
                        {ownerName}
                      </button>
                    </div>
                  )}

                  {/* Category */}
                  {agent.category && (
                    <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-4 py-3">
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">
                        {t("profilePage.category")}
                      </span>
                      <span className="text-sm text-foreground">
                        {agent.category}
                      </span>
                    </div>
                  )}

                  {/* Stats (owner only) */}
                  {stats && (
                    <>
                      <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-4 py-3">
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">
                          {t("profilePage.totalMessages")}
                        </span>
                        <span className="text-sm text-foreground">
                          {stats.totalMessages.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-4 py-3">
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">
                          {t("profilePage.totalConversations")}
                        </span>
                        <span className="text-sm text-foreground">
                          {stats.totalConversations.toLocaleString()}
                        </span>
                      </div>
                      {stats.lastActive && (
                        <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-4 py-3">
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            {t("profilePage.lastActive")}
                          </span>
                          <span className="text-sm text-foreground">
                            {new Date(stats.lastActive).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {/* Capabilities */}
                  {agent.voiceCapable && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      <span className="rounded-full bg-brand/15 px-3 py-1 text-xs font-medium text-brand-text">
                        {t("profilePage.voiceCapable")}
                      </span>
                    </div>
                  )}
                </div>

                {/* Listen Mode (group context, agent owner only) */}
                {convId && isAgentOwner && groupMembers && (
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center gap-2">
                      <Radio className="h-4 w-4 text-brand-text" />
                      <h3 className="text-sm font-semibold">
                        {t("agentProfile.listenMode")}
                      </h3>
                    </div>

                    <div className="space-y-2">
                      {LISTEN_MODES.map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          disabled={listenModeLoading}
                          onClick={() => handleListenModeChange(mode)}
                          className={`flex w-full items-start gap-3 rounded-lg px-4 py-3 text-left transition-colors ${
                            listenMode === mode
                              ? "bg-brand/10 ring-1 ring-brand/40"
                              : "bg-secondary/60 hover:bg-secondary"
                          }`}
                        >
                          <div
                            className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                              listenMode === mode
                                ? "border-brand"
                                : "border-muted-foreground/40"
                            }`}
                          >
                            {listenMode === mode && (
                              <div className="h-2 w-2 rounded-full bg-brand" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {t(`agentProfile.listenMode.${mode}`)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {t(`agentProfile.listenMode.${mode}.desc`)}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Allowed users list (only when owner_and_allowlist mode) */}
                    {listenMode === "owner_and_allowlist" && (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground px-1">
                          {t("agentProfile.allowedUsers")}
                        </p>
                        {groupMembers.users
                          .filter((u) => u.userId !== session?.user?.id)
                          .map((user) => (
                            <button
                              key={user.userId}
                              type="button"
                              onClick={() => handleToggleAllowedUser(user.userId)}
                              className={`flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left transition-colors ${
                                allowedUserIds.has(user.userId)
                                  ? "bg-brand/10 ring-1 ring-brand/30"
                                  : "bg-secondary/60 hover:bg-secondary"
                              }`}
                            >
                              {user.image ? (
                                <img
                                  src={assetUrl(user.image)}
                                  alt={user.name}
                                  className="h-7 w-7 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold">
                                  {(user.name ?? "?").charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="text-sm flex-1 truncate">
                                {user.name}
                              </span>
                              <div
                                className={`h-4 w-4 rounded border-2 flex items-center justify-center ${
                                  allowedUserIds.has(user.userId)
                                    ? "border-brand bg-brand"
                                    : "border-muted-foreground/40"
                                }`}
                              >
                                {allowedUserIds.has(user.userId) && (
                                  <svg
                                    viewBox="0 0 12 12"
                                    className="h-2.5 w-2.5 text-white"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path d="M2 6l3 3 5-5" />
                                  </svg>
                                )}
                              </div>
                            </button>
                          ))}
                        {groupMembers.users.filter((u) => u.userId !== session?.user?.id).length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-3">
                            No other users in this group
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function AgentProfilePage() {
  return (
    <AuthGuard>
      <AgentProfileContent />
    </AuthGuard>
  );
}
