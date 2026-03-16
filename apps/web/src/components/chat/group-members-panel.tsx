"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useChatStore, type GroupAgentMember, type GroupUserMember, type GroupMembers } from "@/store/chat-store";
import { authClient } from "@/lib/auth-client";
import { assetUrl } from "@/lib/config";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Bot,
  Brain,
  Copy,
  Check,
  Crown,
  Link2,
  Loader2,
  LogOut,
  MoreHorizontal,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldBan,
  UserMinus,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  UserPlus,
} from "lucide-react";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n";

export type PanelTab = "members" | "settings";

interface GroupMembersPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  initialTab?: PanelTab;
  onAddMemberClick?: () => void;
  inline?: boolean;
}

export function GroupMembersPanel({
  open,
  onOpenChange,
  conversationId,
  initialTab,
  onAddMemberClick,
  inline,
}: GroupMembersPanelProps) {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;

  const groupMembersData = useChatStore((s) => s.groupMembersData);
  const loadGroupMembersV2 = useChatStore((s) => s.loadGroupMembersV2);
  const kickUser = useChatStore((s) => s.kickUser);
  const promoteUser = useChatStore((s) => s.promoteUser);
  const demoteUser = useChatStore((s) => s.demoteUser);
  const transferAdmin = useChatStore((s) => s.transferAdmin);
  const leaveGroup = useChatStore((s) => s.leaveGroup);
  const generateInviteLink = useChatStore((s) => s.generateInviteLink);
  const updateGroupSettings = useChatStore((s) => s.updateGroupSettings);
  const updateAgentListenMode = useChatStore((s) => s.updateAgentListenMode);
  const withdrawAgent = useChatStore((s) => s.withdrawAgent);
  const blockUser = useChatStore((s) => s.blockUser);
  const conversations = useChatStore((s) => s.conversations);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const tab: PanelTab = initialTab ?? "members";
  const [showAgents, setShowAgents] = useState(true);

  // Settings state
  const conversation = conversations.find((c) => c.id === conversationId);
  const [editTitle, setEditTitle] = useState(conversation?.title ?? "");
  const [settingsSaving, setSettingsSaving] = useState(false);

  const members: GroupMembers | undefined = groupMembersData[conversationId];
  const myRole = members?.users.find((u) => u.userId === currentUserId)?.role;
  const isAdmin = myRole === "admin";
  const isViceAdmin = myRole === "vice_admin";
  const canManage = isAdmin || isViceAdmin;

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await loadGroupMembersV2(conversationId);
    } catch {
      setError(t("group.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, [conversationId, loadGroupMembersV2]);

  useEffect(() => {
    if (open) {
      loadMembers();
      setEditTitle(conversation?.title ?? "");
    }
  }, [open, loadMembers, conversation?.title, initialTab]);

  const handleAction = async (action: () => Promise<void>, id: string) => {
    setActionLoading(id);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyInvite = async () => {
    try {
      const token = await generateInviteLink(conversationId);
      const link = `${window.location.origin}/join/${token}`;
      await navigator.clipboard.writeText(link);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate invite link");
    }
  };

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    setError("");
    try {
      const settings: { title?: string; mentionOnly?: boolean } = {};
      if (editTitle.trim() && editTitle.trim() !== conversation?.title) {
        settings.title = editTitle.trim();
      }
      if (Object.keys(settings).length > 0) {
        await updateGroupSettings(conversationId, settings);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleLeave = async () => {
    try {
      await leaveGroup(conversationId);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to leave group");
    }
  };

  const content = (
    <>
      {error && (
        <div className="mx-4 mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading && !members ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tab === "members" ? (
          <MembersTab
            members={members}
            currentUserId={currentUserId}
            myRole={myRole}
            isAdmin={isAdmin}
            isViceAdmin={isViceAdmin}
            canManage={canManage}
            conversationId={conversationId}
            actionLoading={actionLoading}
            showAgents={showAgents}
            setShowAgents={setShowAgents}
            onClosePanel={() => onOpenChange(false)}
            onKick={(userId) => handleAction(() => kickUser(conversationId, userId), `kick-${userId}`)}
            onPromote={(userId) => handleAction(() => promoteUser(conversationId, userId), `promote-${userId}`)}
            onDemote={(userId) => handleAction(() => demoteUser(conversationId, userId), `demote-${userId}`)}
            onTransferAdmin={(userId) => handleAction(() => transferAdmin(conversationId, userId), `transfer-${userId}`)}
            onBlock={(userId) => handleAction(async () => { await blockUser(userId); await loadGroupMembersV2(conversationId); }, `block-${userId}`)}
            onUpdateListenMode={(agentId, mode) => handleAction(() => updateAgentListenMode(conversationId, agentId, mode), `listen-${agentId}`)}
            onWithdrawAgent={(agentId) => handleAction(() => withdrawAgent(conversationId, agentId), `withdraw-${agentId}`)}
          />
        ) : (
          <SettingsTab
            editTitle={editTitle}
            setEditTitle={setEditTitle}
            conversation={conversation}
            saving={settingsSaving}
            isAdmin={isAdmin}
            conversationId={conversationId}
            onSave={handleSaveSettings}
            onUpdateSettings={updateGroupSettings}
          />
        )}
      </div>

      {/* Footer Actions */}
      <div className="border-t border-border p-4 space-y-2">
        {canManage && onAddMemberClick && (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => { onAddMemberClick(); onOpenChange(false); }}
          >
            <UserPlus className="h-4 w-4" />
            {t("addMember.title")}
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handleCopyInvite}
          >
            {inviteCopied ? (
              <Check className="h-4 w-4 text-green-400" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            {inviteCopied ? t("group.copied") : t("group.copyInvite")}
          </Button>
        )}
        {/* Leave group: not shown to admin unless they transfer first */}
        {!isAdmin && myRole && (
          <Button
            variant="outline"
            className="w-full gap-2 text-red-400 hover:text-red-300 hover:border-red-600"
            onClick={handleLeave}
          >
            <LogOut className="h-4 w-4" />
            {t("group.leaveGroup")}
          </Button>
        )}
      </div>
    </>
  );

  if (inline) {
    return <div className="flex flex-col h-full">{content}</div>;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 sm:max-w-sm p-0 flex flex-col" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-base">
            {tab === "settings" ? t("group.settings") : t("group.members")}
          </SheetTitle>
        </SheetHeader>

        <div className="border-b border-border" />

        {content}
      </SheetContent>
    </Sheet>
  );
}

// ===== Members Tab =====

function MembersTab({
  members,
  currentUserId,
  myRole,
  isAdmin,
  isViceAdmin,
  canManage,
  conversationId,
  actionLoading,
  showAgents,
  setShowAgents,
  onClosePanel,
  onKick,
  onPromote,
  onDemote,
  onTransferAdmin,
  onBlock,
  onUpdateListenMode,
  onWithdrawAgent,
}: {
  members: GroupMembers | undefined;
  currentUserId: string | undefined;
  myRole: string | undefined;
  isAdmin: boolean;
  isViceAdmin: boolean;
  canManage: boolean;
  conversationId: string;
  actionLoading: string | null;
  showAgents: boolean;
  setShowAgents: (v: boolean) => void;
  onClosePanel: () => void;
  onKick: (userId: string) => void;
  onPromote: (userId: string) => void;
  onDemote: (userId: string) => void;
  onTransferAdmin: (userId: string) => void;
  onBlock: (userId: string) => void;
  onUpdateListenMode: (agentId: string, mode: string) => void;
  onWithdrawAgent: (agentId: string) => void;
}) {
  const { t } = useTranslation();

  if (!members) return null;

  return (
    <div className="px-4 py-3 space-y-4">
      {/* User Members */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          {t("group.users")} ({members.users.length})
        </p>
        <div className="space-y-1">
          {members.users.map((user) => (
            <UserMemberRow
              key={user.userId}
              user={user}
              isCurrentUser={user.userId === currentUserId}
              isAdmin={isAdmin}
              isViceAdmin={isViceAdmin}
              canManage={canManage}
              actionLoading={actionLoading}
              onClosePanel={onClosePanel}
              onKick={onKick}
              onPromote={onPromote}
              onDemote={onDemote}
              onTransferAdmin={onTransferAdmin}
              onBlock={onBlock}
            />
          ))}
        </div>
      </div>

      <Separator />

      {/* Agent Members */}
      <div>
        <button
          className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2"
          onClick={() => setShowAgents(!showAgents)}
        >
          <span>{t("group.agents")} ({members.agents.length})</span>
          {showAgents ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {showAgents && (
          <div className="space-y-1">
            {members.agents.map((agent) => (
              <AgentMemberRow
                key={agent.agentId}
                agent={agent}
                currentUserId={currentUserId}
                conversationId={conversationId}
                actionLoading={actionLoading}
                onClosePanel={onClosePanel}
                onUpdateListenMode={onUpdateListenMode}
                onWithdrawAgent={onWithdrawAgent}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== User Member Row =====

function RoleBadge({ role }: { role: string }) {
  const { t } = useTranslation();

  if (role === "admin") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
        <Crown className="h-2.5 w-2.5" />
        {t("group.admin")}
      </span>
    );
  }
  if (role === "vice_admin") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
        <ShieldCheck className="h-2.5 w-2.5" />
        {t("group.viceAdmin")}
      </span>
    );
  }
  return null;
}

function UserMemberRow({
  user,
  isCurrentUser,
  isAdmin,
  isViceAdmin,
  canManage,
  actionLoading,
  onClosePanel,
  onKick,
  onPromote,
  onDemote,
  onTransferAdmin,
  onBlock,
}: {
  user: GroupUserMember;
  isCurrentUser: boolean;
  isAdmin: boolean;
  isViceAdmin: boolean;
  canManage: boolean;
  actionLoading: string | null;
  onClosePanel: () => void;
  onKick: (userId: string) => void;
  onPromote: (userId: string) => void;
  onDemote: (userId: string) => void;
  onTransferAdmin: (userId: string) => void;
  onBlock: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);

  const showAdminMenu =
    canManage &&
    !isCurrentUser &&
    // vice-admins can only manage regular members
    (isAdmin || (isViceAdmin && user.role === "member"));
  // Block option is available for any non-self member
  const showMenu = showAdminMenu || !isCurrentUser;

  const handleProfileClick = useCallback(() => {
    onClosePanel();
    router.push(`/profile/${user.userId}`);
  }, [onClosePanel, router, user.userId]);

  return (
    <>
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-accent/50 transition-colors">
        <button type="button" onClick={handleProfileClick} className="shrink-0 cursor-pointer">
          <Avatar className="h-8 w-8">
            {user.image ? (
              <AvatarImage src={assetUrl(user.image)} alt={user.username ?? user.name} />
            ) : null}
            <AvatarFallback className="text-xs bg-accent">
              {(user.name ?? user.username ?? "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </button>
        <button type="button" onClick={handleProfileClick} className="min-w-0 flex-1 text-left cursor-pointer">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate hover:underline">
              {user.name}{isCurrentUser ? ` ${t("group.you")}` : ""}
            </p>
            {user.isVerified && <VerifiedBadge className="h-3.5 w-3.5 shrink-0 text-blue-500" />}
            <RoleBadge role={user.role} />
          </div>
          {user.username && (
            <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
          )}
        </button>
        {showMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                disabled={actionLoading !== null}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {showAdminMenu && isAdmin && user.role === "member" && (
                <DropdownMenuItem onClick={() => onPromote(user.userId)}>
                  <ShieldCheck className="h-4 w-4" />
                  {t("group.promoteVice")}
                </DropdownMenuItem>
              )}
              {showAdminMenu && isAdmin && user.role === "vice_admin" && (
                <DropdownMenuItem onClick={() => onDemote(user.userId)}>
                  <Shield className="h-4 w-4" />
                  {t("group.demoteMember")}
                </DropdownMenuItem>
              )}
              {showAdminMenu && isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onTransferAdmin(user.userId)}>
                    <ArrowRightLeft className="h-4 w-4" />
                    {t("group.transferAdmin")}
                  </DropdownMenuItem>
                </>
              )}
              {showAdminMenu && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onKick(user.userId)}
                  >
                    <UserMinus className="h-4 w-4" />
                    {t("group.kick")}
                  </DropdownMenuItem>
                </>
              )}
              {!isCurrentUser && (
                <>
                  {showAdminMenu && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setBlockConfirmOpen(true)}
                  >
                    <ShieldBan className="h-4 w-4" />
                    {t("group.blockUser")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Block confirmation dialog */}
      <Dialog open={blockConfirmOpen} onOpenChange={setBlockConfirmOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("group.blockConfirm")} {user.name}?</DialogTitle>
            <DialogDescription>
              {t("group.blockDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setBlockConfirmOpen(false);
                onBlock(user.userId);
              }}
            >
              {t("group.block")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ===== Agent Member Row =====

function useListenModeLabels() {
  const { t } = useTranslation();
  return {
    all: t("group.listenMode.all"),
    all_mentions: t("group.allMentions"),
    owner_unmention_others_mention: t("group.listenMode.ownerUnmentionOthersMention"),
    owner_and_allowlist: t("group.listenMode.ownerAndAllowlist"),
    allowlist_mentions: t("group.listenMode.allowlistMentions"),
    owner_only: t("group.ownerOnly"),
    muted: t("group.listenMode.muted"),
    allowed_users: t("group.allowedUsers"),
  } as Record<string, string>;
}

function AgentMemberRow({
  agent,
  currentUserId,
  conversationId,
  actionLoading,
  onClosePanel,
  onUpdateListenMode,
  onWithdrawAgent,
}: {
  agent: GroupAgentMember;
  currentUserId: string | undefined;
  conversationId: string;
  actionLoading: string | null;
  onClosePanel: () => void;
  onUpdateListenMode: (agentId: string, mode: string) => void;
  onWithdrawAgent: (agentId: string) => void;
}) {
  const { t } = useTranslation();
  const LISTEN_MODE_LABELS = useListenModeLabels();
  const router = useRouter();
  const isOwner = agent.ownerUserId === currentUserId;

  const handleProfileClick = useCallback(() => {
    onClosePanel();
    router.push(`/agent/${agent.agentId}?convId=${conversationId}`);
  }, [onClosePanel, router, agent.agentId, conversationId]);

  return (
    <div className="rounded-lg px-2 py-2 hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={handleProfileClick} className="shrink-0 cursor-pointer">
          {agent.agentAvatarUrl ? (
            <img
              src={assetUrl(agent.agentAvatarUrl)}
              alt={agent.agentName}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent">
              <Bot className="h-4 w-4" />
            </div>
          )}
        </button>
        <button type="button" onClick={handleProfileClick} className="min-w-0 flex-1 text-left cursor-pointer">
          <p className="text-sm font-medium truncate hover:underline">{agent.agentName}</p>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">
              {LISTEN_MODE_LABELS[agent.listenMode] ?? agent.listenMode}
            </span>
            {isOwner && (
              <span className="text-[10px] text-blue-400">{t("group.yours")}</span>
            )}
          </div>
        </button>
        {isOwner && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                disabled={actionLoading !== null}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="px-2 py-1.5">
                <p className="text-xs font-medium mb-1.5">{t("group.listenMode")}</p>
                <Select
                  value={agent.listenMode}
                  onValueChange={(val) => onUpdateListenMode(agent.agentId, val)}
                >
                  <SelectTrigger className="h-8 text-xs w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("group.listenMode.all")}</SelectItem>
                    <SelectItem value="all_mentions">{t("group.allMentions")}</SelectItem>
                    <SelectItem value="owner_unmention_others_mention">{t("group.listenMode.ownerUnmentionOthersMention")}</SelectItem>
                    <SelectItem value="owner_and_allowlist">{t("group.listenMode.ownerAndAllowlist")}</SelectItem>
                    <SelectItem value="allowlist_mentions">{t("group.listenMode.allowlistMentions")}</SelectItem>
                    <SelectItem value="owner_only">{t("group.ownerOnly")}</SelectItem>
                    <SelectItem value="muted">{t("group.listenMode.muted")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onWithdrawAgent(agent.agentId)}
              >
                <LogOut className="h-4 w-4" />
                {t("group.withdrawAgent")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

// ===== Settings Tab =====

function SettingsTab({
  editTitle,
  setEditTitle,
  conversation,
  saving,
  isAdmin,
  conversationId,
  onSave,
  onUpdateSettings,
}: {
  editTitle: string;
  setEditTitle: (v: string) => void;
  conversation: { title: string | null; mentionOnly: boolean } | undefined;
  saving: boolean;
  isAdmin: boolean;
  conversationId: string;
  onSave: () => Promise<void>;
  onUpdateSettings: (id: string, settings: { title?: string; inviteEnabled?: boolean; mentionOnly?: boolean }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [mentionOnly, setMentionOnly] = useState(conversation?.mentionOnly ?? true);

  const handleMentionOnlyToggle = async (checked: boolean) => {
    setMentionOnly(checked);
    try {
      await onUpdateSettings(conversationId, { mentionOnly: checked });
    } catch {
      setMentionOnly(!checked);
    }
  };

  return (
    <div className="px-4 py-3 space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("group.groupName")}</label>
        <div className="flex gap-2">
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="bg-secondary border-none text-sm"
            placeholder={t("group.groupNamePlaceholder")}
          />
          <Button
            size="sm"
            onClick={onSave}
            disabled={saving || !editTitle.trim() || editTitle.trim() === conversation?.title}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{t("group.mentionOnly")}</p>
          <p className="text-xs text-muted-foreground">
            {t("group.mentionOnlyDesc")}
          </p>
        </div>
        <Switch
          checked={mentionOnly}
          onCheckedChange={handleMentionOnlyToggle}
        />
      </div>

      <Separator />

      {isAdmin && (
        <MemoryCapsuleSection conversationId={conversationId} />
      )}
    </div>
  );
}

// ===== Memory Capsule Section =====

interface CapsuleInfo {
  capsuleId: string | null;
  name?: string;
  status?: string;
  messageCount?: number;
  entryCount?: number;
  visibility?: string;
  progress?: { processed?: number; total?: number } | null;
  canView?: boolean;
  isOwner?: boolean;
}

function MemoryCapsuleSection({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const [capsule, setCapsule] = useState<CapsuleInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");

  const fetchCapsule = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/capsule`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setCapsule(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchCapsule();
  }, [fetchCapsule]);

  // Poll while extracting
  useEffect(() => {
    if (capsule?.status !== "extracting") return;
    const interval = setInterval(fetchCapsule, 5000);
    return () => clearInterval(interval);
  }, [capsule?.status, fetchCapsule]);

  const handleExtract = async () => {
    setExtracting(true);
    setError("");
    try {
      const res = await fetch(`/api/conversations/${conversationId}/capsule/extract`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to extract");
      }
      await fetchCapsule();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract");
    } finally {
      setExtracting(false);
    }
  };

  const handleVisibilityChange = async (visibility: string) => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/capsule/visibility`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      if (res.ok) {
        setCapsule((prev) => prev ? { ...prev, visibility } : prev);
      }
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Brain className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{t("common.loading")}...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-brand" />
        <p className="text-sm font-medium">{t("group.memoryCapsule")}</p>
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {!capsule?.capsuleId ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {t("group.memoryCapsuleDesc")}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={handleExtract}
            disabled={extracting}
          >
            {extracting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Brain className="h-3 w-3" />
            )}
            {t("group.extractMemory")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Status */}
          <div className="rounded-lg bg-accent/50 px-3 py-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t("common.status")}</span>
              <span className={`text-xs font-medium ${
                capsule.status === "ready" ? "text-green-400" :
                capsule.status === "extracting" ? "text-amber-400" :
                capsule.status === "failed" ? "text-red-400" : "text-muted-foreground"
              }`}>
                {capsule.status === "ready" ? t("group.capsuleReady") :
                 capsule.status === "extracting" ? t("group.capsuleExtracting") :
                 capsule.status === "failed" ? t("group.capsuleFailed") :
                 capsule.status}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t("group.messages")}</span>
              <span className="text-xs">{capsule.messageCount ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t("group.memories")}</span>
              <span className="text-xs">{capsule.entryCount ?? 0}</span>
            </div>
            {capsule.status === "extracting" && capsule.progress && (
              <div className="pt-1">
                <div className="h-1.5 rounded-full bg-accent overflow-hidden">
                  <div
                    className="h-full bg-brand rounded-full transition-all"
                    style={{
                      width: `${capsule.progress.total ? Math.round(((capsule.progress.processed ?? 0) / capsule.progress.total) * 100) : 0}%`,
                    }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {capsule.progress.processed ?? 0} / {capsule.progress.total ?? 0}
                </p>
              </div>
            )}
          </div>

          {/* Refresh button */}
          {capsule.status !== "extracting" && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={handleExtract}
              disabled={extracting}
            >
              {extracting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {t("group.refreshMemory")}
            </Button>
          )}

          {/* Visibility */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium">{t("group.capsuleVisibility")}</p>
            <Select
              value={capsule.visibility ?? "owner_only"}
              onValueChange={handleVisibilityChange}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner_only">{t("group.visibilityOwnerOnly")}</SelectItem>
                <SelectItem value="admins">{t("group.visibilityAdmins")}</SelectItem>
                <SelectItem value="all_members">{t("group.visibilityAllMembers")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
