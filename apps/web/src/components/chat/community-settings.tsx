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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Bell,
  BellOff,
  AtSign,
  Link2,
  Copy,
  Plus,
  X,
  Lock,
  Globe,
  MessageSquare,
  Users,
  Bot,
  ClipboardCheck,
  Check,
} from "lucide-react";
import { useChatStore } from "@/store/chat-store";

type Tab = "info" | "members" | "personal" | "permissions" | "invites" | "danger";

interface CommunitySettingsProps {
  open: boolean;
  onClose: () => void;
  communityId: string;
  conversationId: string;
  initialTab?: Tab;
}

interface CommunityInfo {
  id: string;
  creatorId: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  requireApproval: boolean;
  approvalQuestions: string[] | null;
  isPrivate: boolean;
  invitePermission: string;
  postPermission: string;
  allowAgents: boolean;
  agentJoinPolicy: string;
}

interface Member {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  userName: string;
  userImage: string | null;
  notificationPreference: string;
}

interface Application {
  id: string;
  userId: string;
  userName?: string;
  answers: unknown[];
  status: string;
  createdAt: string;
}

interface Invite {
  id: string;
  code: string;
  createdBy: string;
  maxUses: number | null;
  useCount: number;
  expiresAt: string | null;
  createdAt: string;
}

export function CommunitySettingsSheet({
  open,
  onClose,
  communityId,
  conversationId,
  initialTab,
}: CommunitySettingsProps) {
  const { t } = useTranslation();
  const session = authClient.useSession();
  const currentUserId = session.data?.user?.id;

  const [community, setCommunity] = useState<CommunityInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? "info");

  // Reset tab when opened with a different initialTab
  useEffect(() => {
    if (open && initialTab) setActiveTab(initialTab);
  }, [open, initialTab]);

  // Editable fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);
  const [approvalQuestions, setApprovalQuestions] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  // Permission fields
  const [postPermission, setPostPermission] = useState("everyone");
  const [invitePermission, setInvitePermission] = useState("admin");
  const [allowAgents, setAllowAgents] = useState(true);
  const [agentJoinPolicy, setAgentJoinPolicy] = useState("owner_only");
  const [permSaveState, setPermSaveState] = useState<"idle" | "saving" | "saved">("idle");

  // Personal settings
  const [notifPref, setNotifPref] = useState("all");
  const [notifSaving, setNotifSaving] = useState(false);

  // Invite creation
  const [inviteMaxUses, setInviteMaxUses] = useState("");
  const [inviteExpiry, setInviteExpiry] = useState("24");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const currentUserRole = members.find((m) => m.userId === currentUserId)?.role ?? null;
  const isCreator = currentUserRole === "creator";
  const isAdmin = currentUserRole === "moderator";
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
      setIsPrivate(communityData.isPrivate);
      setRequireApproval(communityData.requireApproval);
      setApprovalQuestions(communityData.approvalQuestions ?? []);
      setPostPermission(communityData.postPermission);
      setInvitePermission(communityData.invitePermission);
      setAllowAgents(communityData.allowAgents);
      setAgentJoinPolicy(communityData.agentJoinPolicy);

      // Set current user's notification preference
      const me = membersData.members.find((m: Member) => m.userId === session.data?.user?.id);
      if (me) setNotifPref(me.notificationPreference);
    } catch {
      // error toast handled by api()
    } finally {
      setLoading(false);
    }
  }, [communityId, session.data?.user?.id]);

  // Load applications and invites when tab changes (admin only)
  useEffect(() => {
    if (!open || !canManage) return;
    if (activeTab === "members") {
      api<{ applications: Application[] }>(`/api/communities/${communityId}/applications`)
        .then((res) => setApplications(res.applications ?? []))
        .catch(() => {});
    }
    if (activeTab === "invites") {
      api<{ invites: Invite[] }>(`/api/communities/${communityId}/invites`)
        .then((res) => setInvites(res.invites ?? []))
        .catch(() => {});
    }
  }, [open, activeTab, canManage, communityId]);

  useEffect(() => {
    if (open) {
      fetchData();
      setActiveTab("info");
    }
  }, [open, fetchData]);

  // ── Save Info ──
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
          isPrivate,
          requireApproval,
          approvalQuestions: approvalQuestions.filter((q) => q.trim()),
        }),
      });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("idle");
    }
  }, [communityId, name, description, avatarUrl, isPrivate, requireApproval, approvalQuestions]);

  // ── Save Permissions ──
  const handleSavePermissions = useCallback(async () => {
    if (!communityId) return;
    setPermSaveState("saving");
    try {
      await api(`/api/communities/${communityId}`, {
        method: "PUT",
        body: JSON.stringify({
          postPermission,
          invitePermission,
          allowAgents,
          agentJoinPolicy,
        }),
      });
      setPermSaveState("saved");
      setTimeout(() => setPermSaveState("idle"), 2000);
    } catch {
      setPermSaveState("idle");
    }
  }, [communityId, postPermission, invitePermission, allowAgents, agentJoinPolicy]);

  // ── Notification Preference ──
  const handleNotifPref = useCallback(
    async (value: string) => {
      setNotifPref(value);
      setNotifSaving(true);
      try {
        await api(`/api/communities/${communityId}/members/me/preferences`, {
          method: "PATCH",
          body: JSON.stringify({ notificationPreference: value }),
        });
      } catch {
        // revert on error
      } finally {
        setNotifSaving(false);
      }
    },
    [communityId]
  );

  // ── Member Management ──
  const handleUpdateRole = useCallback(
    async (userId: string, newRole: "admin" | "member") => {
      try {
        await api(`/api/communities/${communityId}/members/${userId}`, {
          method: "PATCH",
          body: JSON.stringify({ role: newRole }),
        });
        setMembers((prev) =>
          prev.map((m) => (m.userId === userId ? { ...m, role: newRole === "admin" ? "moderator" : newRole } : m))
        );
      } catch {}
    },
    [communityId]
  );

  const handleKick = useCallback(
    async (userId: string) => {
      if (!confirm(t("communitySettings.kickConfirm"))) return;
      try {
        await api(`/api/communities/${communityId}/members/${userId}`, { method: "DELETE" });
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
      } catch {}
    },
    [communityId, t]
  );

  const handleReviewApplication = useCallback(
    async (appId: string, approved: boolean) => {
      try {
        await api(`/api/communities/${communityId}/applications/${appId}/review`, {
          method: "POST",
          body: JSON.stringify({ approved }),
        });
        setApplications((prev) => prev.filter((a) => a.id !== appId));
        if (approved) fetchData();
      } catch {}
    },
    [communityId, fetchData]
  );

  // ── Leave / Delete / Transfer ──
  const handleLeave = useCallback(async () => {
    if (!confirm(t("communitySettings.leaveConfirm"))) return;
    try {
      await api(`/api/communities/${communityId}/leave`, { method: "POST" });
      onClose();
      useChatStore.getState().setActiveConversation(null);
    } catch {}
  }, [communityId, t, onClose]);

  const handleDelete = useCallback(async () => {
    if (!confirm(t("communitySettings.deleteConfirm"))) return;
    try {
      await api(`/api/communities/${communityId}`, { method: "DELETE" });
      onClose();
      useChatStore.getState().setActiveConversation(null);
    } catch {}
  }, [communityId, t, onClose]);

  const handleTransfer = useCallback(
    async (targetUserId: string, targetName: string) => {
      if (!confirm(t("communitySettings.transferConfirm", { name: targetName }))) return;
      try {
        await api(`/api/communities/${communityId}/transfer`, {
          method: "POST",
          body: JSON.stringify({ userId: targetUserId }),
        });
        await fetchData();
      } catch {}
    },
    [communityId, t, fetchData]
  );

  // ── Invite Management ──
  const handleCreateInvite = useCallback(async () => {
    try {
      const res = await api<Invite>(`/api/communities/${communityId}/invites`, {
        method: "POST",
        body: JSON.stringify({
          maxUses: inviteMaxUses ? parseInt(inviteMaxUses) : null,
          expiresInHours: parseInt(inviteExpiry) || 24,
        }),
      });
      setInvites((prev) => [res, ...prev]);
    } catch {}
  }, [communityId, inviteMaxUses, inviteExpiry]);

  const handleDeleteInvite = useCallback(
    async (inviteId: string) => {
      try {
        await api(`/api/communities/${communityId}/invites/${inviteId}`, { method: "DELETE" });
        setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      } catch {}
    },
    [communityId]
  );

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // ── Helpers ──
  const roleIcon = (role: string) => {
    switch (role) {
      case "creator":
        return <Crown className="h-3.5 w-3.5 text-yellow-500" />;
      case "moderator":
        return <Shield className="h-3.5 w-3.5 text-blue-500" />;
      default:
        return <User className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const roleBadgeVariant = (role: string) => {
    switch (role) {
      case "creator":
        return "default" as const;
      case "moderator":
        return "secondary" as const;
      default:
        return "outline" as const;
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    { id: "info", label: t("communitySettings.info"), icon: <Globe className="h-4 w-4" /> },
    { id: "members", label: t("communitySettings.members"), icon: <Users className="h-4 w-4" /> },
    { id: "personal", label: t("communitySettings.personalSettings"), icon: <Bell className="h-4 w-4" /> },
    { id: "permissions", label: t("communitySettings.permissions"), icon: <Lock className="h-4 w-4" />, adminOnly: true },
    { id: "invites", label: t("communitySettings.invites"), icon: <Link2 className="h-4 w-4" />, adminOnly: true },
    { id: "danger", label: t("communitySettings.dangerZone"), icon: <Trash2 className="h-4 w-4" /> },
  ];

  const visibleTabs = tabs.filter((tab) => !tab.adminOnly || canManage);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-lg p-0">
        <SheetHeader className="px-4 pt-4 pb-0">
          <SheetTitle>{t("communitySettings.title")}</SheetTitle>
        </SheetHeader>

        {/* Tab Navigation */}
        <div className="flex gap-1 px-4 py-2 overflow-x-auto border-b border-border">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? "bg-brand text-white"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : (
          <div className="p-4">
            {/* ── Info Tab ── */}
            {activeTab === "info" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">{t("communitySettings.name")}</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">{t("communitySettings.description")}</label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canManage} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">{t("communitySettings.avatar")}</label>
                  <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} disabled={!canManage} />
                </div>

                {canManage && (
                  <>
                    <Separator />
                    {/* Private Toggle */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isPrivate ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                        <div>
                          <p className="text-sm font-medium">{t("communitySettings.visibility")}</p>
                          <p className="text-xs text-muted-foreground">
                            {isPrivate ? t("communitySettings.private") : t("communitySettings.public")}
                          </p>
                        </div>
                      </div>
                      <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
                    </div>

                    {/* Require Approval */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4" />
                        <div>
                          <p className="text-sm font-medium">{t("communitySettings.requireApproval")}</p>
                          <p className="text-xs text-muted-foreground">{t("communitySettings.requireApprovalDesc")}</p>
                        </div>
                      </div>
                      <Switch checked={requireApproval} onCheckedChange={setRequireApproval} />
                    </div>

                    {/* Approval Questions */}
                    {requireApproval && (
                      <div className="space-y-2 pl-6">
                        <p className="text-xs font-medium text-muted-foreground">{t("communitySettings.approvalQuestions")}</p>
                        {approvalQuestions.map((q, i) => (
                          <div key={i} className="flex gap-2">
                            <Input
                              value={q}
                              onChange={(e) => {
                                const next = [...approvalQuestions];
                                next[i] = e.target.value;
                                setApprovalQuestions(next);
                              }}
                              placeholder={`${t("communitySettings.question")} ${i + 1}`}
                              className="text-sm"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => setApprovalQuestions(approvalQuestions.filter((_, j) => j !== i))}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        {approvalQuestions.length < 5 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setApprovalQuestions([...approvalQuestions, ""])}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            {t("communitySettings.addQuestion")}
                          </Button>
                        )}
                      </div>
                    )}

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
                  </>
                )}
              </div>
            )}

            {/* ── Members Tab ── */}
            {activeTab === "members" && (
              <div className="space-y-4">
                {/* Pending Applications (admin only) */}
                {canManage && applications.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-amber-600">
                      {t("communitySettings.pendingApplications")} ({applications.length})
                    </h3>
                    {applications.map((app) => (
                      <div key={app.id} className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-2">
                        <p className="text-sm font-medium">{app.userName || app.userId}</p>
                        {Array.isArray(app.answers) && app.answers.length > 0 && (
                          <div className="text-xs text-muted-foreground space-y-1">
                            {(app.answers as string[]).map((a, i) => (
                              <p key={i}>{a}</p>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button size="sm" variant="default" onClick={() => handleReviewApplication(app.id, true)}>
                            {t("communitySettings.approve")}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleReviewApplication(app.id, false)}>
                            {t("communitySettings.reject")}
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Separator />
                  </div>
                )}

                <h3 className="text-sm font-semibold">
                  {t("communitySettings.members")} ({members.length})
                </h3>
                {members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("communitySettings.noMembers")}</p>
                ) : (
                  <div className="space-y-2">
                    {members.map((member) => {
                      const isMe = member.userId === currentUserId;
                      const isMemberCreator = member.role === "creator";
                      return (
                        <div key={member.userId} className="flex items-center gap-3 rounded-lg border p-2">
                          <Avatar className="h-8 w-8">
                            <img
                              src={member.userImage ? assetUrl(member.userImage) : AGENT_DEFAULT_AVATAR}
                              alt={member.userName}
                              className="h-full w-full object-cover"
                            />
                            <AvatarFallback className="text-xs">{member.userName?.charAt(0) ?? "?"}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium">{member.userName}</span>
                              {isMe && <span className="text-xs text-muted-foreground">{t("communitySettings.you")}</span>}
                            </div>
                            <div className="flex items-center gap-1">
                              {roleIcon(member.role)}
                              <Badge variant={roleBadgeVariant(member.role)}>
                                {t(`communitySettings.role.${member.role === "moderator" ? "admin" : member.role}`)}
                              </Badge>
                            </div>
                          </div>
                          {canManage && !isMe && !isMemberCreator && (
                            <div className="flex items-center gap-1">
                              {member.role === "member" ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title={t("communitySettings.promote")}
                                  onClick={() => handleUpdateRole(member.userId, "admin")}
                                >
                                  <Shield className="h-3.5 w-3.5" />
                                </Button>
                              ) : member.role === "moderator" && isCreator ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title={t("communitySettings.demote")}
                                  onClick={() => handleUpdateRole(member.userId, "member")}
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
                                  onClick={() => handleTransfer(member.userId, member.userName)}
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
              </div>
            )}

            {/* ── Personal Settings Tab ── */}
            {activeTab === "personal" && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">{t("communitySettings.notifications")}</h3>
                <p className="text-xs text-muted-foreground">{t("communitySettings.notificationsDesc")}</p>
                <div className="space-y-2">
                  {(["all", "mentions", "mute"] as const).map((pref) => {
                    const icons = { all: Bell, mentions: AtSign, mute: BellOff };
                    const Icon = icons[pref];
                    return (
                      <button
                        key={pref}
                        type="button"
                        onClick={() => handleNotifPref(pref)}
                        disabled={notifSaving}
                        className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                          notifPref === pref ? "border-brand bg-brand/5" : "hover:bg-accent"
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${notifPref === pref ? "text-brand" : "text-muted-foreground"}`} />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{t(`communitySettings.notif.${pref}`)}</p>
                          <p className="text-xs text-muted-foreground">{t(`communitySettings.notif.${pref}Desc`)}</p>
                        </div>
                        {notifPref === pref && <Check className="h-4 w-4 text-brand" />}
                      </button>
                    );
                  })}
                </div>

                <Separator />

                {/* Leave community */}
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
              </div>
            )}

            {/* ── Permissions Tab (Admin Only) ── */}
            {activeTab === "permissions" && canManage && (
              <div className="space-y-4">
                {/* Post Permission */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {t("communitySettings.postPermission")}
                  </label>
                  <Select value={postPermission} onValueChange={setPostPermission}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="everyone">{t("communitySettings.postPermission.everyone")}</SelectItem>
                      <SelectItem value="admin_only">{t("communitySettings.postPermission.adminOnly")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Invite Permission */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5" />
                    {t("communitySettings.invitePermission")}
                  </label>
                  <Select value={invitePermission} onValueChange={setInvitePermission}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">{t("communitySettings.invitePermission.admin")}</SelectItem>
                      <SelectItem value="member">{t("communitySettings.invitePermission.member")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Allow Agents */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    <div>
                      <p className="text-sm font-medium">{t("communitySettings.allowAgents")}</p>
                      <p className="text-xs text-muted-foreground">{t("communitySettings.allowAgentsDesc")}</p>
                    </div>
                  </div>
                  <Switch checked={allowAgents} onCheckedChange={setAllowAgents} />
                </div>

                {/* Agent Join Policy */}
                {allowAgents && (
                  <div className="space-y-2 pl-6">
                    <label className="text-xs font-medium text-muted-foreground">{t("communitySettings.agentPolicy")}</label>
                    <Select value={agentJoinPolicy} onValueChange={setAgentJoinPolicy}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner_only">{t("communitySettings.agentPolicy.ownerOnly")}</SelectItem>
                        <SelectItem value="admin_agents">{t("communitySettings.agentPolicy.adminAgents")}</SelectItem>
                        <SelectItem value="member_agents">{t("communitySettings.agentPolicy.memberAgents")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Button
                  size="sm"
                  onClick={handleSavePermissions}
                  disabled={permSaveState === "saving"}
                >
                  {permSaveState === "saving"
                    ? t("communitySettings.saving")
                    : permSaveState === "saved"
                      ? t("communitySettings.saved")
                      : t("communitySettings.saveInfo")}
                </Button>
              </div>
            )}

            {/* ── Invites Tab (Admin Only) ── */}
            {activeTab === "invites" && canManage && (
              <div className="space-y-4">
                {/* Create Invite */}
                <div className="space-y-3 rounded-lg border p-3">
                  <h3 className="text-sm font-semibold">{t("communitySettings.createInvite")}</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">{t("communitySettings.maxUses")}</label>
                      <Input
                        type="number"
                        placeholder={t("communitySettings.unlimited")}
                        value={inviteMaxUses}
                        onChange={(e) => setInviteMaxUses(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">{t("communitySettings.expiresIn")}</label>
                      <Select value={inviteExpiry} onValueChange={setInviteExpiry}>
                        <SelectTrigger className="text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1h</SelectItem>
                          <SelectItem value="24">24h</SelectItem>
                          <SelectItem value="168">7d</SelectItem>
                          <SelectItem value="720">30d</SelectItem>
                          <SelectItem value="0">{t("communitySettings.never")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button size="sm" onClick={handleCreateInvite}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    {t("communitySettings.generateInvite")}
                  </Button>
                </div>

                {/* Existing Invites */}
                {invites.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{t("communitySettings.noInvites")}</p>
                ) : (
                  <div className="space-y-2">
                    {invites.map((invite) => {
                      const expired = invite.expiresAt && new Date(invite.expiresAt) < new Date();
                      const maxedOut = invite.maxUses !== null && invite.useCount >= invite.maxUses;
                      const isActive = !expired && !maxedOut;
                      return (
                        <div
                          key={invite.id}
                          className={`flex items-center gap-3 rounded-lg border p-2 ${!isActive ? "opacity-50" : ""}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <code className="text-sm font-mono">{invite.code}</code>
                              <button
                                type="button"
                                onClick={() => handleCopyCode(invite.code)}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                {copiedCode === invite.code ? (
                                  <Check className="h-3.5 w-3.5 text-green-500" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {invite.useCount}{invite.maxUses !== null ? `/${invite.maxUses}` : ""} {t("communitySettings.uses")}
                              {invite.expiresAt && ` · ${expired ? t("communitySettings.expired") : new Date(invite.expiresAt).toLocaleDateString()}`}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDeleteInvite(invite.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Danger Zone Tab ── */}
            {activeTab === "danger" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("communitySettings.dangerZoneDesc")}</p>

                {isCreator && (
                  <>
                    {/* Transfer */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">{t("communitySettings.transfer")}</h4>
                      <p className="text-xs text-muted-foreground">{t("communitySettings.transferDesc")}</p>
                      <div className="space-y-1">
                        {members
                          .filter((m) => m.userId !== currentUserId)
                          .map((m) => (
                            <Button
                              key={m.userId}
                              variant="outline"
                              size="sm"
                              className="w-full justify-start gap-2"
                              onClick={() => handleTransfer(m.userId, m.userName)}
                            >
                              <ArrowUpDown className="h-3.5 w-3.5" />
                              {t("communitySettings.transferTo")} {m.userName}
                            </Button>
                          ))}
                      </div>
                    </div>

                    <Separator />

                    {/* Delete */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-destructive">{t("communitySettings.delete")}</h4>
                      <p className="text-xs text-muted-foreground">{t("communitySettings.deleteDesc")}</p>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full justify-start gap-2"
                        onClick={handleDelete}
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("communitySettings.delete")}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
