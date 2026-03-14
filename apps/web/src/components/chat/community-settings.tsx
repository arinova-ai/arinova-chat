"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { authClient } from "@/lib/auth-client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { assetUrl, AGENT_DEFAULT_AVATAR } from "@/lib/config";
import {
  Crown,
  Shield,
  User,
  UserMinus,
  ArrowUpDown,
  Trash2,
  LogOut,
} from "lucide-react";
import { useChatStore } from "@/store/chat-store";

interface CommunitySettingsProps {
  open: boolean;
  onClose: () => void;
  communityId: string;
  conversationId: string;
}

interface CommunityInfo {
  id: string;
  creatorId: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
}

interface Member {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  userName: string;
  userImage: string | null;
}

export function CommunitySettingsSheet({
  open,
  onClose,
  communityId,
  conversationId,
}: CommunitySettingsProps) {
  const { t } = useTranslation();
  const session = authClient.useSession();
  const currentUserId = session.data?.user?.id;

  const [community, setCommunity] = useState<CommunityInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle"
  );

  const currentUserRole =
    members.find((m) => m.userId === currentUserId)?.role ?? null;
  const isCreator = currentUserRole === "creator";
  const isAdmin = currentUserRole === "admin";
  const canManage = isCreator || isAdmin;

  const fetchData = useCallback(async () => {
    if (!communityId) return;
    setLoading(true);
    try {
      const [communityData, membersData] = await Promise.all([
        api<CommunityInfo>(`/api/communities/${communityId}`),
        api<{ members: Member[] }>(`/api/communities/${communityId}/members`),
      ]);
      setCommunity(communityData);
      setMembers(membersData.members);
      setName(communityData.name);
      setDescription(communityData.description ?? "");
      setAvatarUrl(communityData.avatarUrl ?? "");
    } catch {
      // error toast handled by api()
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, fetchData]);

  const handleSaveInfo = useCallback(async () => {
    if (!communityId) return;
    setSaveState("saving");
    try {
      await api(`/api/communities/${communityId}`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          description: description || null,
          avatarUrl: avatarUrl || null,
        }),
      });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("idle");
    }
  }, [communityId, name, description, avatarUrl]);

  const handleUpdateRole = useCallback(
    async (userId: string, newRole: "admin" | "member") => {
      try {
        await api(
          `/api/communities/${communityId}/members/${userId}`,
          {
            method: "PATCH",
            body: JSON.stringify({ role: newRole }),
          }
        );
        setMembers((prev) =>
          prev.map((m) => (m.userId === userId ? { ...m, role: newRole } : m))
        );
      } catch {
        // error toast handled by api()
      }
    },
    [communityId]
  );

  const handleKick = useCallback(
    async (userId: string) => {
      if (!confirm(t("communitySettings.kickConfirm"))) return;
      try {
        await api(
          `/api/communities/${communityId}/members/${userId}`,
          { method: "DELETE" }
        );
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
      } catch {
        // error toast handled by api()
      }
    },
    [communityId, t]
  );

  const handleLeave = useCallback(async () => {
    if (!confirm(t("communitySettings.leaveConfirm"))) return;
    try {
      await api(`/api/communities/${communityId}/leave`, { method: "POST" });
      onClose();
      useChatStore.getState().setActiveConversation(null);
    } catch {
      // error toast handled by api()
    }
  }, [communityId, t, onClose]);

  const handleDelete = useCallback(async () => {
    if (!confirm(t("communitySettings.deleteConfirm"))) return;
    try {
      await api(`/api/communities/${communityId}`, { method: "DELETE" });
      onClose();
      useChatStore.getState().setActiveConversation(null);
    } catch {
      // error toast handled by api()
    }
  }, [communityId, t, onClose]);

  const handleTransfer = useCallback(
    async (targetUserId: string, targetName: string) => {
      if (
        !confirm(
          t("communitySettings.transferConfirm", { name: targetName })
        )
      )
        return;
      try {
        await api(`/api/communities/${communityId}/transfer`, {
          method: "POST",
          body: JSON.stringify({ userId: targetUserId }),
        });
        await fetchData();
      } catch {
        // error toast handled by api()
      }
    },
    [communityId, t, fetchData]
  );

  const roleIcon = (role: string) => {
    switch (role) {
      case "creator":
        return <Crown className="h-3.5 w-3.5 text-yellow-500" />;
      case "admin":
        return <Shield className="h-3.5 w-3.5 text-blue-500" />;
      default:
        return <User className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const roleBadgeVariant = (role: string) => {
    switch (role) {
      case "creator":
        return "default" as const;
      case "admin":
        return "secondary" as const;
      default:
        return "outline" as const;
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("communitySettings.title")}</SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : (
          <div className="space-y-6 px-1">
            {/* ── Info Section ── */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">
                {t("communitySettings.info")}
              </h3>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground">
                    {t("communitySettings.name")}
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!canManage}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    {t("communitySettings.description")}
                  </label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={!canManage}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    {t("communitySettings.avatar")}
                  </label>
                  <Input
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    disabled={!canManage}
                  />
                </div>
                {canManage && (
                  <Button
                    size="sm"
                    onClick={handleSaveInfo}
                    disabled={saveState === "saving" || !name.trim()}
                  >
                    {saveState === "saving"
                      ? t("communitySettings.saving")
                      : saveState === "saved"
                        ? t("communitySettings.saved")
                        : t("communitySettings.saveInfo")}
                  </Button>
                )}
              </div>
            </section>

            <Separator />

            {/* ── Members Section ── */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">
                {t("communitySettings.members")} ({members.length})
              </h3>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("communitySettings.noMembers")}
                </p>
              ) : (
                <div className="space-y-2">
                  {members.map((member) => {
                    const isMe = member.userId === currentUserId;
                    const isMemberCreator = member.role === "creator";
                    return (
                      <div
                        key={member.userId}
                        className="flex items-center gap-3 rounded-lg border p-2"
                      >
                        <Avatar className="h-8 w-8">
                          <img
                            src={
                              member.userImage
                                ? assetUrl(member.userImage)
                                : AGENT_DEFAULT_AVATAR
                            }
                            alt={member.userName}
                            className="h-full w-full object-cover"
                          />
                          <AvatarFallback className="text-xs">
                            {member.userName?.charAt(0) ?? "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">
                              {member.userName}
                            </span>
                            {isMe && (
                              <span className="text-xs text-muted-foreground">
                                {t("communitySettings.you")}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {roleIcon(member.role)}
                            <Badge variant={roleBadgeVariant(member.role)}>
                              {t(`communitySettings.role.${member.role}`)}
                            </Badge>
                          </div>
                        </div>
                        {/* Actions */}
                        {canManage && !isMe && !isMemberCreator && (
                          <div className="flex items-center gap-1">
                            {member.role === "member" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title={t("communitySettings.promote")}
                                onClick={() =>
                                  handleUpdateRole(member.userId, "admin")
                                }
                              >
                                <Shield className="h-3.5 w-3.5" />
                              </Button>
                            ) : member.role === "admin" && isCreator ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title={t("communitySettings.demote")}
                                onClick={() =>
                                  handleUpdateRole(member.userId, "member")
                                }
                              >
                                <User className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              title={t("communitySettings.kick")}
                              onClick={() => handleKick(member.userId)}
                            >
                              <UserMinus className="h-3.5 w-3.5" />
                            </Button>
                            {isCreator && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title={t("communitySettings.transfer")}
                                onClick={() =>
                                  handleTransfer(
                                    member.userId,
                                    member.userName
                                  )
                                }
                              >
                                <ArrowUpDown className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <Separator />

            {/* ── Danger Zone ── */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-destructive">
                {t("communitySettings.dangerZone")}
              </h3>
              <div className="space-y-2">
                {!isCreator && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                    onClick={handleLeave}
                  >
                    <LogOut className="h-4 w-4" />
                    {t("communitySettings.leave")}
                  </Button>
                )}
                {isCreator && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full justify-start gap-2"
                    onClick={handleDelete}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("communitySettings.delete")}
                  </Button>
                )}
              </div>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
