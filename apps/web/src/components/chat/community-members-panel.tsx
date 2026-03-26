"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { assetUrl } from "@/lib/config";
import { authClient } from "@/lib/auth-client";
import { useToastStore } from "@/store/toast-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Crown,
  Shield,
  Wrench,
  Search,
  UserPlus,
  Bot,
  Check,
  Loader2,
  MoreHorizontal,
  UserMinus,
  VolumeX,
  Volume2,
  ShieldCheck,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DefaultAvatarPicker } from "@/components/ui/default-avatar-picker";
import { CommunityMemberSheet } from "./community-member-sheet";

interface Member {
  id: string;
  userId: string;
  role: string;
  userName: string;
  userImage: string | null;
  displayName?: string | null;
  memberAvatarUrl?: string | null;
  isMuted?: boolean;
  mutedUntil?: string | null;
}

interface AgentMember {
  id: string;
  agentName: string;
  avatarUrl: string | null;
}

interface MyAgent {
  id: string;
  name: string;
  avatarUrl: string | null;
}

type View = "main" | "selectAgent" | "setupAgent" | "inviteFriends";

interface CommunityMembersPanelProps {
  open: boolean;
  onClose: () => void;
  communityId: string;
  canManage?: boolean;
}

export function CommunityMembersPanel({
  open,
  onClose,
  communityId,
  canManage,
}: CommunityMembersPanelProps) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<Member[]>([]);
  const [agents, setAgents] = useState<AgentMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("main");

  // Add agent flow
  const [myAgents, setMyAgents] = useState<MyAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<MyAgent | null>(null);
  const [agentDisplayName, setAgentDisplayName] = useState("");
  const [agentAvatarUrl, setAgentAvatarUrl] = useState("");
  const [agentListenMode, setAgentListenMode] = useState("all");
  const [agentSearch, setAgentSearch] = useState("");
  const [adding, setAdding] = useState(false);

  // Invite friends flow
  const [friendsList, setFriendsList] = useState<{ id: string; name: string; image: string | null }[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [friendSearch, setFriendSearch] = useState("");

  // Profile sheet
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  // Kick/mute
  const [confirmKick, setConfirmKick] = useState<Member | null>(null);
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;

  const fetchData = useCallback(async () => {
    if (!communityId) return;
    setLoading(true);
    try {
      const [membersData, agentsData] = await Promise.all([
        api<{ members: Member[] }>(`/api/communities/${communityId}/members`),
        api<{ agents: AgentMember[] }>(`/api/communities/${communityId}/agents`, { silent: true }).catch(() => ({ agents: [] as AgentMember[] })),
      ]);
      setMembers(membersData.members);
      setAgents(agentsData.agents);
    } catch {
      // api shows toast
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    if (open) {
      fetchData();
      setSearch("");
      setView("main");
    }
  }, [open, fetchData]);

  const handleOpenAddAgent = useCallback(async () => {
    setView("selectAgent");
    setAgentSearch("");
    setSelectedAgent(null);
    try {
      const existingData = await api<{ agents: AgentMember[] }>(`/api/communities/${communityId}/agents`, { silent: true });
      const existingIds = new Set(existingData.agents.map((a) => a.id));
      const all = await api<MyAgent[]>("/api/agents", { silent: true });
      setMyAgents(all.filter((a) => !existingIds.has(a.id)));
    } catch {
      setMyAgents([]);
    }
  }, [communityId]);

  const handleSelectAgent = (agent: MyAgent) => {
    setSelectedAgent(agent);
    setAgentDisplayName(agent.name);
    setAgentAvatarUrl("");
    setAgentListenMode("all");
    setView("setupAgent");
  };

  const handleConfirmAddAgent = useCallback(async () => {
    if (!selectedAgent) return;
    setAdding(true);
    try {
      await api(`/api/communities/${communityId}/agents`, {
        method: "POST",
        body: JSON.stringify({
          agentId: selectedAgent.id,
          displayName: agentDisplayName || undefined,
          memberAvatarUrl: agentAvatarUrl || undefined,
          listenMode: agentListenMode,
        }),
      });
      await fetchData();
      setView("main");
    } catch {
      // api shows toast
    } finally {
      setAdding(false);
    }
  }, [communityId, selectedAgent, agentDisplayName, agentListenMode, fetchData]);

  const handleOpenInviteFriends = useCallback(async () => {
    setView("inviteFriends");
    setFriendSearch("");
    setSelectedFriends(new Set());
    try {
      const friends = await api<{ id: string; name: string; image: string | null }[]>("/api/friends", { silent: true });
      const memberIds = new Set(members.map((m) => m.userId));
      setFriendsList(friends.filter((f) => !memberIds.has(f.id)));
    } catch {
      setFriendsList([]);
    }
  }, [members]);

  const handleBatchInvite = useCallback(async () => {
    let sent = 0;
    for (const userId of selectedFriends) {
      try {
        await api(`/api/communities/${communityId}/members`, {
          method: "POST",
          body: JSON.stringify({ userId }),
        });
        sent++;
      } catch {}
    }
    if (sent > 0) {
      useToastStore.getState().addToast(t("communityMembers.inviteSent"), "success");
    }
    setView("main");
    fetchData();
  }, [communityId, selectedFriends, fetchData, t]);

  const myRole = members.find((m) => m.userId === currentUserId)?.role;
  const isCreatorOrAdmin = myRole === "creator" || myRole === "moderator" || myRole === "admin";

  const handleKick = useCallback(async (userId: string) => {
    try {
      await api(`/api/communities/${communityId}/members/${userId}`, { method: "DELETE" });
      useToastStore.getState().addToast(t("communityMembers.kicked"), "success");
      fetchData();
    } catch {}
    setConfirmKick(null);
  }, [communityId, fetchData, t]);

  const handleMute = useCallback(async (userId: string, duration: number | null) => {
    try {
      await api(`/api/communities/${communityId}/mute-member`, {
        method: "POST",
        body: JSON.stringify({ userId, duration }),
      });
      useToastStore.getState().addToast(t("communityMembers.muted"), "success");
      fetchData();
    } catch {}
  }, [communityId, fetchData, t]);

  const handleUnmute = useCallback(async (userId: string) => {
    try {
      await api(`/api/communities/${communityId}/unmute-member`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      useToastStore.getState().addToast(t("communityMembers.unmuted"), "success");
      fetchData();
    } catch {}
  }, [communityId, fetchData, t]);

  const handleChangeRole = useCallback(async (userId: string, role: string) => {
    try {
      await api(`/api/communities/${communityId}/members/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      useToastStore.getState().addToast(t("communityMembers.roleChanged"), "success");
      fetchData();
    } catch {}
  }, [communityId, fetchData, t]);

  if (!open) return null;

  const q = search.toLowerCase();
  const filteredMembers = q
    ? members.filter((m) => (m.displayName || m.userName).toLowerCase().includes(q))
    : members;
  const filteredAgents = q
    ? agents.filter((a) => a.agentName.toLowerCase().includes(q))
    : agents;

  const roleOrder: Record<string, number> = { creator: 0, moderator: 1, member: 2 };
  const sortedMembers = [...filteredMembers].sort(
    (a, b) => (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3)
  );

  const roleBadge = (role: string) => {
    switch (role) {
      case "creator":
        return (
          <Badge variant="default" className="gap-0.5 bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
            <Crown className="h-2.5 w-2.5" />
            Creator
          </Badge>
        );
      case "moderator":
        return (
          <Badge variant="default" className="gap-0.5 bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">
            <Shield className="h-2.5 w-2.5" />
            Admin
          </Badge>
        );
      default:
        return null;
    }
  };

  const renderContent = () => {
    if (view === "selectAgent") {
      const filtered = agentSearch
        ? myAgents.filter((a) => a.name.toLowerCase().includes(agentSearch.toLowerCase()))
        : myAgents;
      return (
        <>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <button type="button" onClick={() => setView("main")} className="rounded-lg p-1.5 hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="flex-1 text-base font-semibold">{t("communitySettings.addAgent")}</h2>
          </div>
          <div className="px-4 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={agentSearch} onChange={(e) => setAgentSearch(e.target.value)} placeholder={t("communityMembers.searchAgents")} className="pl-9" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-1">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("communitySettings.noAgentsToAdd")}</p>
            ) : (
              filtered.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-accent/50 text-left"
                  onClick={() => handleSelectAgent(a)}
                >
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
                    {a.avatarUrl && <img src={assetUrl(a.avatarUrl)} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <p className="flex-1 text-sm font-medium truncate">{a.name}</p>
                </button>
              ))
            )}
          </div>
        </>
      );
    }

    if (view === "setupAgent" && selectedAgent) {
      return (
        <>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <button type="button" onClick={() => setView("selectAgent")} className="rounded-lg p-1.5 hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="flex-1 text-base font-semibold">{t("communityMembers.agentSetup")}</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            {/* Agent preview */}
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
                {selectedAgent.avatarUrl && <img src={assetUrl(selectedAgent.avatarUrl)} alt="" className="h-full w-full object-cover" />}
              </div>
              <div>
                <p className="text-sm font-semibold">{selectedAgent.name}</p>
                <Badge variant="secondary" className="text-[10px] mt-0.5">agent</Badge>
              </div>
            </div>

            {/* Avatar picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("communityMembers.avatar")}</label>
              {agentAvatarUrl && (
                <div className="flex items-center gap-3 mb-2">
                  <img src={agentAvatarUrl} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-brand" />
                  <Button variant="ghost" size="sm" onClick={() => setAgentAvatarUrl("")} className="text-muted-foreground text-xs">
                    {t("common.remove")}
                  </Button>
                </div>
              )}
              <DefaultAvatarPicker onSelect={setAgentAvatarUrl} selected={agentAvatarUrl} />
            </div>

            {/* Display name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("communityMembers.displayName")}</label>
              <Input
                value={agentDisplayName}
                onChange={(e) => setAgentDisplayName(e.target.value)}
                placeholder={selectedAgent.name}
                maxLength={100}
              />
            </div>

            {/* Listen mode */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("communityMembers.listenMode")}</label>
              <Select value={agentListenMode} onValueChange={setAgentListenMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("communityMembers.listenAll")}</SelectItem>
                  <SelectItem value="all_mentions">{t("communityMembers.listenMention")}</SelectItem>
                  <SelectItem value="muted">{t("communityMembers.listenNone")}</SelectItem>
                  <SelectItem value="owner_only">{t("communityMembers.listenOwnerOnly")}</SelectItem>
                  <SelectItem value="owner_and_allowlist">{t("communityMembers.listenOwnerAllowlist")}</SelectItem>
                  <SelectItem value="allowlist_mentions">{t("communityMembers.listenAllowlistMentions")}</SelectItem>
                  <SelectItem value="owner_unmention_others_mention">{t("communityMembers.listenOwnerAllOthersMention")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{t("communityMembers.listenModeDesc")}</p>
            </div>
          </div>

          {/* Confirm button */}
          <div className="border-t border-border px-4 py-3">
            <Button className="w-full gap-2" onClick={handleConfirmAddAgent} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
              {t("communitySettings.add")}
            </Button>
          </div>
        </>
      );
    }

    if (view === "inviteFriends") {
      const filtered = friendSearch
        ? friendsList.filter((f) => f.name.toLowerCase().includes(friendSearch.toLowerCase()))
        : friendsList;
      return (
        <>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <button type="button" onClick={() => setView("main")} className="rounded-lg p-1.5 hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="flex-1 text-base font-semibold">{t("communitySettings.inviteFriends")}</h2>
          </div>
          <div className="px-4 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={friendSearch} onChange={(e) => setFriendSearch(e.target.value)} placeholder={t("communityMembers.searchFriends")} className="pl-9" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-1">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("communitySettings.noFriendsToInvite")}</p>
            ) : (
              filtered.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50 text-left"
                  onClick={() => setSelectedFriends((prev) => {
                    const next = new Set(prev);
                    next.has(f.id) ? next.delete(f.id) : next.add(f.id);
                    return next;
                  })}
                >
                  <div className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 ${selectedFriends.has(f.id) ? "bg-brand border-brand text-white" : "border-muted-foreground/30"}`}>
                    {selectedFriends.has(f.id) && <Check className="h-3 w-3" />}
                  </div>
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
                    {f.image && <img src={f.image} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <p className="flex-1 text-sm font-medium truncate">{f.name}</p>
                </button>
              ))
            )}
          </div>
          {selectedFriends.size > 0 && (
            <div className="border-t border-border px-4 py-3">
              <Button className="w-full" onClick={handleBatchInvite}>
                {t("communitySettings.invite")} ({selectedFriends.size})
              </Button>
            </div>
          )}
        </>
      );
    }

    // Main view
    return (
      <>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="flex-1 text-base font-semibold">{t("communitySettings.members")}</h2>
          <span className="text-xs text-muted-foreground">{members.length + agents.length}</span>
        </div>

        <div className="px-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("communityMembers.search")} className="pl-9" />
          </div>
        </div>

        {canManage && (
          <div className="flex gap-2 px-4 py-1">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleOpenInviteFriends}>
              <UserPlus className="h-3.5 w-3.5" />
              {t("communitySettings.inviteFriends")}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleOpenAddAgent}>
              <Bot className="h-3.5 w-3.5" />
              {t("communitySettings.addAgent")}
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {sortedMembers.length > 0 && (
                <div className="space-y-0.5">
                  <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
                    {t("communityMembers.humans")} ({filteredMembers.length})
                  </p>
                  {sortedMembers.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50 cursor-pointer" onClick={() => setProfileUserId(m.userId)}>
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                        {(m.memberAvatarUrl || m.userImage) ? (
                          <img src={assetUrl(m.memberAvatarUrl || m.userImage || "")} alt="" className="h-full w-full object-cover" />
                        ) : (
                          (m.displayName || m.userName || "?").charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {m.displayName || m.userName}
                          {m.isMuted && <span className="ml-1 text-[10px] text-red-400">({t("communityMembers.mutedLabel")})</span>}
                        </p>
                      </div>
                      {roleBadge(m.role)}
                      {isCreatorOrAdmin && m.userId !== currentUserId && m.role !== "creator" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="p-1 rounded hover:bg-muted shrink-0">
                              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {m.isMuted ? (
                              <DropdownMenuItem onClick={() => handleUnmute(m.userId)}>
                                <Volume2 className="h-4 w-4" />
                                {t("communityMembers.unmute")}
                              </DropdownMenuItem>
                            ) : (
                              <>
                                <DropdownMenuItem onClick={() => handleMute(m.userId, 3600)}>
                                  <VolumeX className="h-4 w-4" />
                                  {t("communityMembers.mute1h")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleMute(m.userId, 86400)}>
                                  <VolumeX className="h-4 w-4" />
                                  {t("communityMembers.mute24h")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleMute(m.userId, 604800)}>
                                  <VolumeX className="h-4 w-4" />
                                  {t("communityMembers.mute7d")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleMute(m.userId, null)}>
                                  <VolumeX className="h-4 w-4" />
                                  {t("communityMembers.mutePermanent")}
                                </DropdownMenuItem>
                              </>
                            )}
                            {myRole === "creator" && (
                              <>
                                {m.role !== "admin" && (
                                  <DropdownMenuItem onClick={() => handleChangeRole(m.userId, "admin")}>
                                    <ShieldCheck className="h-4 w-4" />
                                    {t("communityMembers.promoteAdmin")}
                                  </DropdownMenuItem>
                                )}
                                {m.role !== "moderator" && (
                                  <DropdownMenuItem onClick={() => handleChangeRole(m.userId, "moderator")}>
                                    <Wrench className="h-4 w-4" />
                                    {t("communityMembers.promoteMod")}
                                  </DropdownMenuItem>
                                )}
                                {m.role !== "member" && (
                                  <DropdownMenuItem onClick={() => handleChangeRole(m.userId, "member")}>
                                    <Shield className="h-4 w-4" />
                                    {t("communityMembers.demoteToMember")}
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                            <DropdownMenuItem className="text-red-400" onClick={() => setConfirmKick(m)}>
                              <UserMinus className="h-4 w-4" />
                              {t("communityMembers.kick")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {filteredAgents.length > 0 && (
                <div className="mt-4 space-y-0.5">
                  <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
                    {t("communitySettings.agents")} ({filteredAgents.length})
                  </p>
                  {filteredAgents.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50">
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
                        {a.avatarUrl && <img src={assetUrl(a.avatarUrl)} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <p className="flex-1 min-w-0 text-sm font-medium truncate">{a.agentName}</p>
                      <Badge variant="secondary" className="text-[10px]">agent</Badge>
                    </div>
                  ))}
                </div>
              )}

              {filteredMembers.length === 0 && filteredAgents.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("communitySettings.noMembers")}</p>
              )}
            </>
          )}
        </div>
      </>
    );
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-50 flex flex-col bg-background animate-in slide-in-from-right duration-200"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {renderContent()}
      </div>

      {/* Kick confirmation */}
      {confirmKick && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setConfirmKick(null)}>
          <div className="mx-4 w-full max-w-sm rounded-xl bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">{t("communityMembers.kickConfirmTitle")}</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("communityMembers.kickConfirmDesc", { name: confirmKick.displayName || confirmKick.userName })}
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setConfirmKick(null)}>
                {t("communityMembers.cancel")}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => handleKick(confirmKick.userId)}>
                {t("communityMembers.kick")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Member profile sheet */}
      {profileUserId && (
        <CommunityMemberSheet
          open={!!profileUserId}
          onOpenChange={(open) => !open && setProfileUserId(null)}
          communityId={communityId}
          userId={profileUserId}
        />
      )}
    </>,
    document.body,
  );
}
