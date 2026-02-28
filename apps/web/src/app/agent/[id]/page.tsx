"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { assetUrl, AGENT_DEFAULT_AVATAR } from "@/lib/config";
import { useChatStore } from "@/store/chat-store";
import { authClient } from "@/lib/auth-client";
import type { Agent } from "@arinova/shared/types";
import { ArrowLeft, MessageSquare, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface AgentStats {
  totalMessages: number;
  totalConversations: number;
  lastActive: string | null;
}

function AgentProfileContent() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  const { data: session } = authClient.useSession();
  const storeAgents = useChatStore((s) => s.agents);
  const agentHealth = useChatStore((s) => s.agentHealth);
  const conversations = useChatStore((s) => s.conversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  const storeAgent = storeAgents.find((a) => a.id === agentId);
  const health = agentHealth[agentId];
  const isOnline = health?.status === "online";

  const [agent, setAgent] = useState<Agent | null>(storeAgent ?? null);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(!storeAgent);
  const [ownerName, setOwnerName] = useState<string | null>(null);

  const isOwner = !!(
    session?.user?.id &&
    agent?.ownerId &&
    session.user.id === agent.ownerId
  );

  // Fetch agent details if not in store
  useEffect(() => {
    if (storeAgent) {
      setAgent(storeAgent);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<Agent>(`/api/agents/${agentId}`)
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
  }, [agentId, storeAgent]);

  // Fetch stats
  useEffect(() => {
    if (!agent) return;
    let cancelled = false;
    api<AgentStats>(`/api/agents/${agentId}/stats`)
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

  const handleChat = useCallback(async () => {
    if (!agent) return;
    const existing = conversations.find(
      (c) => c.agentId === agentId && c.type === "direct"
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
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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

                  {/* Chat button */}
                  <Button
                    className="mt-4 gap-2"
                    onClick={handleChat}
                  >
                    <MessageSquare className="h-4 w-4" />
                    {t("profilePage.chat")}
                  </Button>
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

                  {/* Stats */}
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
