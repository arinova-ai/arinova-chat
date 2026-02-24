"use client";

import { useState, useEffect, useCallback } from "react";
import { useChatStore, type GroupAgentMember, type GroupUserMember, type GroupMembers } from "@/store/chat-store";
import { authClient } from "@/lib/auth-client";
import { assetUrl } from "@/lib/config";
import { cn } from "@/lib/utils";
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
  Copy,
  Check,
  Crown,
  Link2,
  Loader2,
  LogOut,
  MoreHorizontal,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldBan,
  UserMinus,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  Settings,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type PanelTab = "members" | "settings";

interface GroupMembersPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  initialTab?: PanelTab;
}

export function GroupMembersPanel({
  open,
  onOpenChange,
  conversationId,
  initialTab,
}: GroupMembersPanelProps) {
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
  const [tab, setTab] = useState<PanelTab>("members");
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
      setError("Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [conversationId, loadGroupMembersV2]);

  useEffect(() => {
    if (open) {
      loadMembers();
      setEditTitle(conversation?.title ?? "");
      if (initialTab) setTab(initialTab);
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 sm:max-w-sm p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-base">Group Info</SheetTitle>
        </SheetHeader>

        {/* Tab Switcher */}
        <div className="flex border-b border-border px-4">
          <button
            className={cn(
              "flex-1 pb-2 text-sm font-medium border-b-2 transition-colors",
              tab === "members"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setTab("members")}
          >
            Members
          </button>
          {isAdmin && (
            <button
              className={cn(
                "flex-1 pb-2 text-sm font-medium border-b-2 transition-colors",
                tab === "settings"
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setTab("settings")}
            >
              Settings
            </button>
          )}
        </div>

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
              {inviteCopied ? "Copied!" : "Copy Invite Link"}
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
              Leave Group
            </Button>
          )}
        </div>
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
  onKick: (userId: string) => void;
  onPromote: (userId: string) => void;
  onDemote: (userId: string) => void;
  onTransferAdmin: (userId: string) => void;
  onBlock: (userId: string) => void;
  onUpdateListenMode: (agentId: string, mode: string) => void;
  onWithdrawAgent: (agentId: string) => void;
}) {
  if (!members) return null;

  return (
    <div className="px-4 py-3 space-y-4">
      {/* User Members */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Users ({members.users.length})
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
          <span>Agents ({members.agents.length})</span>
          {showAgents ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {showAgents && (
          <div className="space-y-1">
            {members.agents.map((agent) => (
              <AgentMemberRow
                key={agent.agentId}
                agent={agent}
                currentUserId={currentUserId}
                actionLoading={actionLoading}
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
  if (role === "admin") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
        <Crown className="h-2.5 w-2.5" />
        Admin
      </span>
    );
  }
  if (role === "vice_admin") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
        <ShieldCheck className="h-2.5 w-2.5" />
        Vice-Admin
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
  onKick: (userId: string) => void;
  onPromote: (userId: string) => void;
  onDemote: (userId: string) => void;
  onTransferAdmin: (userId: string) => void;
  onBlock: (userId: string) => void;
}) {
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);

  const showAdminMenu =
    canManage &&
    !isCurrentUser &&
    // vice-admins can only manage regular members
    (isAdmin || (isViceAdmin && user.role === "member"));
  // Block option is available for any non-self member
  const showMenu = showAdminMenu || !isCurrentUser;

  return (
    <>
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-accent/50 transition-colors">
        <Avatar className="h-8 w-8 shrink-0">
          {user.image ? (
            <AvatarImage src={assetUrl(user.image)} alt={user.username ?? user.name} />
          ) : null}
          <AvatarFallback className="text-xs bg-neutral-700">
            {(user.name ?? user.username ?? "?").charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate">
              {user.name}{isCurrentUser ? " (you)" : ""}
            </p>
            <RoleBadge role={user.role} />
          </div>
          {user.username && (
            <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
          )}
        </div>
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
                  Promote to Vice-Admin
                </DropdownMenuItem>
              )}
              {showAdminMenu && isAdmin && user.role === "vice_admin" && (
                <DropdownMenuItem onClick={() => onDemote(user.userId)}>
                  <Shield className="h-4 w-4" />
                  Demote to Member
                </DropdownMenuItem>
              )}
              {showAdminMenu && isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onTransferAdmin(user.userId)}>
                    <ArrowRightLeft className="h-4 w-4" />
                    Transfer Admin
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
                    Kick
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
                    Block User
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
            <DialogTitle>Block {user.name}?</DialogTitle>
            <DialogDescription>
              They won&apos;t be able to send you messages. You can unblock them later from Settings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setBlockConfirmOpen(false);
                onBlock(user.userId);
              }}
            >
              Block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ===== Agent Member Row =====

const LISTEN_MODE_LABELS: Record<string, string> = {
  owner_only: "Owner Only",
  allowed_users: "Allowed Users",
  all_mentions: "All Mentions",
};

function AgentMemberRow({
  agent,
  currentUserId,
  actionLoading,
  onUpdateListenMode,
  onWithdrawAgent,
}: {
  agent: GroupAgentMember;
  currentUserId: string | undefined;
  actionLoading: string | null;
  onUpdateListenMode: (agentId: string, mode: string) => void;
  onWithdrawAgent: (agentId: string) => void;
}) {
  const isOwner = agent.ownerUserId === currentUserId;

  return (
    <div className="rounded-lg px-2 py-2 hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-2.5">
        {agent.agentAvatarUrl ? (
          <img
            src={assetUrl(agent.agentAvatarUrl)}
            alt={agent.agentName}
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-700">
            <Bot className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{agent.agentName}</p>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">
              {LISTEN_MODE_LABELS[agent.listenMode] ?? agent.listenMode}
            </span>
            {isOwner && (
              <span className="text-[10px] text-blue-400">(yours)</span>
            )}
          </div>
        </div>
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
                <p className="text-xs font-medium mb-1.5">Listen Mode</p>
                <Select
                  value={agent.listenMode}
                  onValueChange={(val) => onUpdateListenMode(agent.agentId, val)}
                >
                  <SelectTrigger className="h-8 text-xs w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner_only">Owner Only</SelectItem>
                    <SelectItem value="allowed_users">Allowed Users</SelectItem>
                    <SelectItem value="all_mentions">All Mentions</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onWithdrawAgent(agent.agentId)}
              >
                <LogOut className="h-4 w-4" />
                Withdraw Agent
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
        <label className="text-sm font-medium">Group Name</label>
        <div className="flex gap-2">
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="bg-neutral-800 border-none text-sm"
            placeholder="Group name"
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
          <p className="text-sm font-medium">Mention Only</p>
          <p className="text-xs text-muted-foreground">
            Only @mentioned agents respond
          </p>
        </div>
        <Switch
          checked={mentionOnly}
          onCheckedChange={handleMentionOnlyToggle}
        />
      </div>
    </div>
  );
}
