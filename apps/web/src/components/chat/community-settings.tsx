"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { assetUrl, AGENT_DEFAULT_AVATAR, BACKEND_URL } from "@/lib/config";
import {
  Crown,
  Shield,
  User,
  UserCircle2,
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
  Upload,
  Loader2,
  EyeOff,
} from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { useToastStore } from "@/store/toast-store";
import { DefaultAvatarPicker } from "@/components/ui/default-avatar-picker";
import { compressImage } from "@/lib/image-compress";

type Tab = "info" | "personal" | "permissions" | "invites" | "hidden" | "danger";

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
  displayName?: string | null;
  memberAvatarUrl?: string | null;
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
    if (open) setActiveTab(initialTab ?? "info");
  }, [open, initialTab]);

  // Editable fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [requireApproval, setRequireApproval] = useState(false);
  const [approvalQuestions, setApprovalQuestions] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  // Permission fields
  const [postPermission, setPostPermission] = useState("everyone");
  const [invitePermission, setInvitePermission] = useState("admin");
  const [allowAgents, setAllowAgents] = useState(true);
  const [agentJoinPolicy, setAgentJoinPolicy] = useState("owner_only");
  const [permSaveState, setPermSaveState] = useState<"idle" | "saving" | "saved">("idle");

  // Delete state
  const [deleting, setDeleting] = useState(false);

  // Personal settings
  const [notifPref, setNotifPref] = useState("all");
  const [notifSaving, setNotifSaving] = useState(false);

  // Community identity
  const [identityName, setIdentityName] = useState("");
  const [identityAvatar, setIdentityAvatar] = useState("");
  const [identitySaveState, setIdentitySaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [communityAvatarUploading, setCommunityAvatarUploading] = useState(false);
  const communityAvatarInputRef = useRef<HTMLInputElement>(null);

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

      // Set current user's notification preference and identity
      const me = membersData.members.find((m: Member) => m.userId === session.data?.user?.id);
      if (me) {
        setNotifPref(me.notificationPreference);
        setIdentityName(me.displayName ?? "");
        setIdentityAvatar(me.memberAvatarUrl ?? "");
      }
    } catch {
      // error toast handled by api()
    } finally {
      setLoading(false);
    }
  }, [communityId, session.data?.user?.id]);

  // Load applications and invites when tab changes (admin only)
  useEffect(() => {
    if (!open || !canManage) return;
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

  // ── Update Community Identity ──
  const handleSaveIdentity = useCallback(async () => {
    if (!communityId || !identityName.trim()) return;
    setIdentitySaveState("saving");
    try {
      await api(`/api/communities/${communityId}/identity`, {
        method: "PATCH",
        body: JSON.stringify({
          displayName: identityName.trim(),
          avatarUrl: identityAvatar.trim() || null,
        }),
      });
      setIdentitySaveState("saved");
      setTimeout(() => setIdentitySaveState("idle"), 2000);
    } catch {
      setIdentitySaveState("idle");
    }
  }, [communityId, identityName, identityAvatar]);

  const handleAvatarUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setAvatarUploading(true);
    try {
      const compressed = await compressImage(file, { maxWidth: 512, maxHeight: 512, quality: 0.9 });
      const formData = new FormData();
      formData.append("file", compressed, "avatar.jpg");
      const res = await fetch(`${BACKEND_URL}/api/conversations/${conversationId}/settings/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setIdentityAvatar(data.url);
    } catch {
      // silently fail
    } finally {
      setAvatarUploading(false);
    }
  }, [conversationId]);

  const handleCommunityAvatarUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setCommunityAvatarUploading(true);
    try {
      const compressed = await compressImage(file, { maxWidth: 512, maxHeight: 512, quality: 0.9 });
      const formData = new FormData();
      formData.append("file", compressed, "avatar.jpg");
      const res = await fetch(`${BACKEND_URL}/api/conversations/${conversationId}/settings/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Upload failed: ${res.status} ${errText}`);
      }
      const data = await res.json();
      setAvatarUrl(data.url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setCommunityAvatarUploading(false);
    }
  }, [conversationId]);

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
    setDeleting(true);
    try {
      await api(`/api/communities/${communityId}`, { method: "DELETE" });
    } catch (err: unknown) {
      // 404 means already deleted — treat as success
      const status = (err as { status?: number })?.status;
      if (status !== 404) {
        setDeleting(false);
        return;
      }
    }
    useToastStore.getState().addToast(t("communitySettings.deleteSuccess"), "success");
    onClose();
    const store = useChatStore.getState();
    store.setActiveConversation(null);
    // Remove the conversation from the list so it disappears immediately
    useChatStore.setState({
      conversations: store.conversations.filter((c) => c.id !== conversationId),
    });
  }, [communityId, conversationId, t, onClose]);

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
    { id: "personal", label: t("communitySettings.personalSettings"), icon: <Bell className="h-4 w-4" /> },
    { id: "permissions", label: t("communitySettings.permissions"), icon: <Lock className="h-4 w-4" />, adminOnly: true },
    { id: "invites", label: t("communitySettings.invites"), icon: <Link2 className="h-4 w-4" />, adminOnly: true },
    { id: "hidden", label: t("communitySettings.hiddenUsers"), icon: <EyeOff className="h-4 w-4" /> },
    { id: "danger", label: t("communitySettings.dangerZone"), icon: <Trash2 className="h-4 w-4" /> },
  ];

  const visibleTabs = tabs.filter((tab) => !tab.adminOnly || canManage);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex flex-col w-full sm:max-w-lg p-0 overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <SheetHeader className="px-4 pt-4 pb-0 shrink-0">
          <SheetTitle>{t("communitySettings.title")}</SheetTitle>
        </SheetHeader>

        {/* Tab Navigation */}
        <div className="flex gap-1 px-4 py-2 overflow-x-auto border-b border-border shrink-0">
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

        <div className="flex-1 min-h-0 overflow-y-auto">
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
                  <div className="flex items-center gap-3">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={assetUrl(avatarUrl)} alt="" className="h-12 w-12 rounded-full object-cover ring-1 ring-border" />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                        <Users className="h-6 w-6" />
                      </div>
                    )}
                    {canManage && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={communityAvatarUploading}
                          onClick={() => communityAvatarInputRef.current?.click()}
                        >
                          {communityAvatarUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          {t("avatar.orUpload")}
                        </Button>
                        <input
                          ref={communityAvatarInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleCommunityAvatarUpload(f);
                            e.target.value = "";
                          }}
                        />
                      </>
                    )}
                  </div>
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
                      <Switch checked={!isPrivate} onCheckedChange={(v) => setIsPrivate(!v)} />
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
            {/* ── Personal Settings Tab ── */}
            {activeTab === "personal" && (
              <div className="space-y-4">
                {/* Community Identity */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <UserCircle2 className="h-4 w-4" />
                    <h3 className="text-sm font-semibold">{t("community.identity.title")}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("community.identity.desc")}</p>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">{t("community.identity.nickname")}</label>
                    <Input
                      value={identityName}
                      onChange={(e) => setIdentityName(e.target.value)}
                      placeholder={t("community.identity.nicknamePlaceholder")}
                      maxLength={50}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">{t("community.identity.avatar")}</label>
                    <div className="flex items-center gap-3">
                      {identityAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={assetUrl(identityAvatar)} alt="" className="h-12 w-12 rounded-full object-cover ring-1 ring-border" />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                          <UserCircle2 className="h-6 w-6" />
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={avatarUploading}
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        {avatarUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {t("avatar.orUpload")}
                      </Button>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleAvatarUpload(f);
                          e.target.value = "";
                        }}
                      />
                    </div>
                    <DefaultAvatarPicker
                      onSelect={(url) => setIdentityAvatar(url)}
                      selected={identityAvatar}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSaveIdentity}
                    disabled={identitySaveState === "saving" || !identityName.trim()}
                  >
                    {identitySaveState === "saving"
                      ? t("community.identity.updating")
                      : identitySaveState === "saved"
                        ? t("community.identity.updated")
                        : t("community.identity.update")}
                  </Button>
                </div>

                <Separator />

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

            {/* ── Hidden Users Tab ── */}
            {activeTab === "hidden" && (
              <HiddenUsersTab communityId={communityId} />
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
                        {(() => {
                          const moderators = members.filter((m) => m.userId !== currentUserId && m.role === "moderator");
                          return moderators.length > 0 ? moderators.map((m) => (
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
                          )) : (
                            <p className="text-xs text-muted-foreground py-2">{t("communitySettings.noModerators")}</p>
                          );
                        })()}
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
                        disabled={deleting}
                      >
                        <Trash2 className="h-4 w-4" />
                        {deleting ? t("communitySettings.deleting") : t("communitySettings.delete")}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Hidden users management sub-component */
function HiddenUsersTab({ communityId }: { communityId: string }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<{ userId: string; name: string | null; image: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ users: { userId: string; name: string | null; image: string | null }[] }>(
      `/api/communities/${communityId}/hidden-users`
    )
      .then((d) => setUsers(d.users))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [communityId]);

  const handleUnhide = async (userId: string) => {
    try {
      await api(`/api/communities/${communityId}/hidden-users/${userId}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((u) => u.userId !== userId));
      // Remove from local filter
      useChatStore.setState((s) => ({
        communityHiddenUsers: {
          ...s.communityHiddenUsers,
          [communityId]: (s.communityHiddenUsers[communityId] ?? []).filter((id) => id !== userId),
        },
      }));
    } catch { /* */ }
  };

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (users.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">{t("communitySettings.noHiddenUsers")}</p>;
  }

  return (
    <div className="space-y-2">
      {users.map((u) => (
        <div key={u.userId} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/50">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              {u.image ? <AvatarImage src={assetUrl(u.image)} /> : null}
              <AvatarFallback className="text-xs">{(u.name ?? "?").charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{u.name ?? t("common.unknown")}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => handleUnhide(u.userId)}>
            {t("communitySettings.unhide")}
          </Button>
        </div>
      ))}
    </div>
  );
}
