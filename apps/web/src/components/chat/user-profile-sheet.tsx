"use client";

import { useState, useEffect } from "react";
import { useChatStore } from "@/store/chat-store";
import { assetUrl } from "@/lib/config";
import { api } from "@/lib/api";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, Crown, ShieldCheck, Loader2 } from "lucide-react";
import { VisuallyHidden } from "radix-ui";
import { useTranslation } from "@/lib/i18n";

interface UserProfileSheetProps {
  userId: string;
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UserProfile {
  id: string;
  name: string;
  image: string | null;
  username: string | null;
  role?: string;
  createdAt?: string;
}

function RoleBadge({ role }: { role: string }) {
  if (role === "admin") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
        <Crown className="h-3 w-3" />
        Admin
      </span>
    );
  }
  if (role === "vice_admin") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-400">
        <ShieldCheck className="h-3 w-3" />
        Vice-Admin
      </span>
    );
  }
  return null;
}

export function UserProfileSheet({
  userId,
  conversationId,
  open,
  onOpenChange,
}: UserProfileSheetProps) {
  const { t } = useTranslation();
  const groupMembersData = useChatStore((s) => s.groupMembersData);
  const members = groupMembersData[conversationId];

  // Try group members first
  const groupUser = members?.users.find((u) => u.userId === userId);
  const userAgents = members?.agents.filter((a) => a.ownerUserId === userId) ?? [];

  // API fallback for non-group contexts
  const [apiUser, setApiUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || groupUser) {
      setApiUser(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<UserProfile>(`/api/users/${userId}`)
      .then((data) => {
        if (!cancelled) setApiUser(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, userId, groupUser]);

  const user: UserProfile | null = groupUser
    ? { id: groupUser.userId, name: groupUser.name, image: groupUser.image, username: groupUser.username, role: groupUser.role }
    : apiUser;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="rounded-t-2xl border-border bg-secondary px-4 pb-6 pt-3"
      >
        <VisuallyHidden.Root>
          <SheetTitle>{t("userProfile.title")}</SheetTitle>
        </VisuallyHidden.Root>

        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted" />

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {user && (
          <>
            {/* User info */}
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14 shrink-0">
                {user.image ? (
                  <AvatarImage src={assetUrl(user.image)} alt={user.name ?? user.username ?? ""} />
                ) : null}
                <AvatarFallback className="text-lg bg-accent">
                  {(user.name ?? user.username ?? "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold text-foreground truncate">
                    {user.name}
                  </p>
                  {user.role && <RoleBadge role={user.role} />}
                </div>
                {user.username && (
                  <p className="text-sm text-muted-foreground">@{user.username}</p>
                )}
                {user.createdAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("userProfile.joined")} {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>

            {/* Agents section (group context only) */}
            {userAgents.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  {t("userProfile.agentsInGroup")} ({userAgents.length})
                </p>
                <div className="space-y-1">
                  {userAgents.map((agent) => (
                    <div
                      key={agent.agentId}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-2 bg-accent/40"
                    >
                      {agent.agentAvatarUrl ? (
                        <img
                          src={assetUrl(agent.agentAvatarUrl)}
                          alt={agent.agentName}
                          className="h-8 w-8 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                          <Bot className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {agent.agentName}
                        </p>
                        {agent.agentDescription && (
                          <p className="text-xs text-muted-foreground truncate">
                            {agent.agentDescription}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
