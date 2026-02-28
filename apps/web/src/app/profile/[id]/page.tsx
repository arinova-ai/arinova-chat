"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { assetUrl, AGENT_DEFAULT_AVATAR } from "@/lib/config";
import { useChatStore } from "@/store/chat-store";
import { ArrowLeft, Bot, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface UserProfile {
  id: string;
  name: string;
  image: string | null;
  username: string | null;
  bio?: string | null;
  createdAt?: string;
}

interface OwnedAgent {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
}

function UserProfileContent() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const agents = useChatStore((s) => s.agents);
  const agentHealth = useChatStore((s) => s.agentHealth);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // User's own agents visible in the store
  const ownedAgents: OwnedAgent[] = agents
    .filter((a) => a.ownerId === userId)
    .map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      avatarUrl: a.avatarUrl,
    }));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<UserProfile>(`/api/users/${userId}`)
      .then((data) => {
        if (!cancelled) setUser(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

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
            <h1 className="text-base font-semibold">{t("userProfile.title")}</h1>
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

            {!loading && !user && (
              <p className="text-center text-sm text-muted-foreground py-16">
                {t("profilePage.userNotFound")}
              </p>
            )}

            {user && (
              <>
                {/* Profile card */}
                <div className="flex flex-col items-center text-center">
                  <Avatar className="h-20 w-20">
                    {user.image ? (
                      <AvatarImage
                        src={assetUrl(user.image)}
                        alt={user.name ?? user.username ?? ""}
                      />
                    ) : null}
                    <AvatarFallback className="text-2xl bg-accent">
                      {(user.name ?? user.username ?? "?")
                        .charAt(0)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <h2 className="mt-3 text-lg font-semibold text-foreground">
                    {user.name}
                  </h2>

                  {user.username && (
                    <p className="text-sm text-muted-foreground">
                      @{user.username}
                    </p>
                  )}

                  {user.bio && (
                    <p className="mt-2 text-sm text-muted-foreground max-w-md">
                      {user.bio}
                    </p>
                  )}

                  {user.createdAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("userProfile.joined")}{" "}
                      {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {/* Owned agents */}
                {ownedAgents.length > 0 && (
                  <div className="mt-8">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                      {t("profilePage.ownedAgents")} ({ownedAgents.length})
                    </p>
                    <div className="space-y-1">
                      {ownedAgents.map((agent) => {
                        const health = agentHealth[agent.id];
                        const isOnline = health?.status === "online";
                        return (
                          <button
                            key={agent.id}
                            type="button"
                            onClick={() => router.push(`/agent/${agent.id}`)}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 bg-secondary/60 hover:bg-secondary transition-colors text-left"
                          >
                            <div className="relative shrink-0">
                              <img
                                src={
                                  agent.avatarUrl
                                    ? assetUrl(agent.avatarUrl)
                                    : AGENT_DEFAULT_AVATAR
                                }
                                alt={agent.name}
                                className="h-10 w-10 rounded-full object-cover"
                              />
                              <span
                                className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-secondary ${
                                  isOnline ? "bg-emerald-500" : "bg-zinc-500"
                                }`}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground truncate">
                                {agent.name}
                              </p>
                              {agent.description && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {agent.description}
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
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

export default function UserProfilePage() {
  return (
    <AuthGuard>
      <UserProfileContent />
    </AuthGuard>
  );
}
