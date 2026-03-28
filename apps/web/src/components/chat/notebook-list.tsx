"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Archive,
  BookOpen,
  Bot,
  Brain,
  Check,
  Plus,
  ArrowLeft,
  MoreHorizontal,
  Pencil,
  Search,
  Share2,
  Trash2,
  Loader2,
  FolderOpen,
  X,
  Users,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { NotebookSheet } from "./notebook-sheet";
import { useChatStore } from "@/store/chat-store";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

interface Notebook {
  id: string;
  ownerId: string;
  name: string;
  isDefault: boolean;
  sortOrder: number;
  includeInCapsule: boolean;
  noteCount: number;
  createdAt: string;
  updatedAt: string;
  ownerUsername?: string | null;
  permission?: string;
}

interface NotebookListProps {
  conversationId?: string;
  inline?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function NotebookList({ conversationId, inline, open, onOpenChange }: NotebookListProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const currentUserId = useChatStore((s) => s.currentUserId);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNotebook, setSelectedNotebook] = useState<Notebook | null>(null);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [shareNotebookId, setShareNotebookId] = useState<string | null>(null);
  const [shareMembers, setShareMembers] = useState<{ userId: string; username: string; permission: string }[]>([]);
  const [shareFriends, setShareFriends] = useState<{ id: string; name: string; username: string | null }[]>([]);
  const [shareInviteUser, setShareInviteUser] = useState("");
  const [shareInvitePerm, setShareInvitePerm] = useState("view");
  const [capsuleSelectorId, setCapsuleSelectorId] = useState<string | null>(null);
  const [allCapsules, setAllCapsules] = useState<{ id: string; name: string }[]>([]);
  const [selectedCapsuleIds, setSelectedCapsuleIds] = useState<string[]>([]);
  const [capsuleLoading, setCapsuleLoading] = useState(false);
  const [agentSelectorId, setAgentSelectorId] = useState<string | null>(null);
  const [allAgents, setAllAgents] = useState<{ id: string; name: string }[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const userDismissedRef = useRef(false);

  // Synchronously reset state when conversation changes (before render output)
  const [prevConvId, setPrevConvId] = useState(conversationId);
  if (prevConvId !== conversationId) {
    setPrevConvId(conversationId);
    setSelectedNotebook(null);
    setPreferenceLoaded(false);
    userDismissedRef.current = false;
  }

  const fetchNotebooks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ notebooks: Notebook[] }>("/api/notebooks");
      setNotebooks(data.notebooks);
    } catch {
      // auto-handled
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotebooks();
  }, [fetchNotebooks]);

  // Load conversation notebook preference from API
  useEffect(() => {
    if (notebooks.length === 0) return;
    if (!conversationId) {
      // No conversation context (e.g. Office notes) — auto-select default notebook
      if (!selectedNotebook && !userDismissedRef.current) {
        setSelectedNotebook(notebooks.find((n) => n.isDefault) ?? notebooks[0]);
      }
      setPreferenceLoaded(true);
      return;
    }
    // Skip auto-selection if user just dismissed (clicked back)
    if (userDismissedRef.current) {
      setPreferenceLoaded(true);
      return;
    }
    let cancelled = false;
    setPreferenceLoaded(false);
    setSelectedNotebook(null);
    api<{ notebookId?: string; isDefault?: boolean }>(
      `/api/conversations/${conversationId}/notebook-preference`,
      { silent: true },
    )
      .then((pref) => {
        if (cancelled || userDismissedRef.current) return;
        const prefId = pref.notebookId ? String(pref.notebookId) : null;
        if (prefId) {
          const nb = notebooks.find((n) => n.id === prefId);
          if (nb) setSelectedNotebook(nb);
          else setSelectedNotebook(notebooks.find((n) => n.isDefault) ?? notebooks[0]);
        } else {
          setSelectedNotebook(notebooks.find((n) => n.isDefault) ?? notebooks[0]);
        }
      })
      .catch(() => {
        if (cancelled || userDismissedRef.current) return;
        setSelectedNotebook(notebooks.find((n) => n.isDefault) ?? notebooks[0]);
      })
      .finally(() => { if (!cancelled) setPreferenceLoaded(true); });
    return () => { cancelled = true; };
  }, [conversationId, notebooks]);

  // Save preference when user selects a notebook
  const selectNotebook = useCallback((nb: Notebook) => {
    userDismissedRef.current = false;
    setSelectedNotebook(nb);
    if (conversationId) {
      api(`/api/conversations/${conversationId}/notebook-preference`, {
        method: "PUT",
        body: JSON.stringify({ notebookId: nb.id }),
      }).catch((err) => {
        console.error("[notebook-preference] PUT failed:", err);
      });
    }
  }, [conversationId]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await api<Notebook>("/api/notebooks", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNewName("");
      setCreating(false);
      fetchNotebooks();
    } catch {
      // auto-handled
    }
  };

  const handleRename = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    try {
      await api(`/api/notebooks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setEditingId(null);
      setEditName("");
      fetchNotebooks();
    } catch {
      // auto-handled
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/api/notebooks/${id}`, { method: "DELETE" });
      fetchNotebooks();
    } catch {
      // auto-handled
    }
  };

  // Share notebook handlers
  useEffect(() => {
    if (!shareNotebookId) return;
    (async () => {
      try {
        const [membersData, friends] = await Promise.all([
          api<{ owner: unknown; members: { userId: string; username: string; permission: string }[] }>(`/api/notebooks/${shareNotebookId}/members`),
          api<{ id: string; name: string; username: string | null }[]>("/api/friends").catch(() => []),
        ]);
        setShareMembers(membersData.members);
        setShareFriends(friends as { id: string; name: string; username: string | null }[]);
      } catch { /* */ }
    })();
  }, [shareNotebookId]);

  const handleShareInvite = async () => {
    if (!shareNotebookId || !shareInviteUser.trim()) return;
    try {
      await api(`/api/notebooks/${shareNotebookId}/members`, {
        method: "POST",
        body: JSON.stringify({ username: shareInviteUser, permission: shareInvitePerm }),
      });
      setShareInviteUser("");
      // Refetch members
      const data = await api<{ owner: unknown; members: { userId: string; username: string; permission: string }[] }>(`/api/notebooks/${shareNotebookId}/members`);
      setShareMembers(data.members);
    } catch { /* */ }
  };

  const handleShareRemove = async (userId: string) => {
    if (!shareNotebookId) return;
    try {
      await api(`/api/notebooks/${shareNotebookId}/members/${userId}`, { method: "DELETE" });
      setShareMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch { /* */ }
  };

  const handleShareUpdatePerm = async (userId: string, perm: string) => {
    if (!shareNotebookId) return;
    try {
      await api(`/api/notebooks/${shareNotebookId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ permission: perm }),
      });
      setShareMembers((prev) => prev.map((m) => m.userId === userId ? { ...m, permission: perm } : m));
    } catch { /* */ }
  };

  const handleManageCapsules = async (notebookId: string) => {
    setCapsuleSelectorId(notebookId);
    setCapsuleLoading(true);
    try {
      const [capsulesRes, linksRes] = await Promise.all([
        api<{ capsules: { id: string; name: string }[] }>("/api/memory/capsules", { silent: true }),
        api<{ capsuleIds: string[] }>(`/api/notebooks/${notebookId}/capsule-links`, { silent: true }),
      ]);
      setAllCapsules(capsulesRes.capsules || []);
      setSelectedCapsuleIds(linksRes.capsuleIds || []);
    } catch {
      setAllCapsules([]);
      setSelectedCapsuleIds([]);
    } finally {
      setCapsuleLoading(false);
    }
  };

  const handleToggleCapsuleLink = async (capsuleId: string) => {
    if (!capsuleSelectorId) return;
    const next = selectedCapsuleIds.includes(capsuleId)
      ? selectedCapsuleIds.filter((id) => id !== capsuleId)
      : [...selectedCapsuleIds, capsuleId];
    setSelectedCapsuleIds(next);
    try {
      await api(`/api/notebooks/${capsuleSelectorId}/capsule-links`, {
        method: "PUT",
        body: JSON.stringify({ capsuleIds: next }),
      });
      fetchNotebooks();
    } catch {
      // revert on error
      setSelectedCapsuleIds(selectedCapsuleIds);
    }
  };

  const handleManageAgents = async (notebookId: string) => {
    setAgentSelectorId(notebookId);
    setAgentLoading(true);
    try {
      const [agentsRes, permsRes] = await Promise.all([
        api<{ id: string; name: string }[]>("/api/agents", { silent: true }),
        api<{ agentIds: string[] }>(`/api/notebooks/${notebookId}/agent-permissions`, { silent: true }),
      ]);
      setAllAgents((agentsRes || []).map((a) => ({ id: a.id, name: a.name })));
      setSelectedAgentIds(permsRes.agentIds || []);
    } catch {
      setAllAgents([]);
      setSelectedAgentIds([]);
    } finally {
      setAgentLoading(false);
    }
  };

  const handleToggleAgentPermission = async (agentId: string) => {
    if (!agentSelectorId) return;
    const next = selectedAgentIds.includes(agentId)
      ? selectedAgentIds.filter((id) => id !== agentId)
      : [...selectedAgentIds, agentId];
    setSelectedAgentIds(next);
    try {
      await api(`/api/notebooks/${agentSelectorId}/agent-permissions`, {
        method: "PUT",
        body: JSON.stringify({ agentIds: next }),
      });
    } catch {
      setSelectedAgentIds(selectedAgentIds);
    }
  };

  // Share dialog
  const shareDialog = shareNotebookId ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setShareNotebookId(null)}>
      <div className="bg-background border border-border rounded-lg w-[380px] max-h-[400px] overflow-y-auto p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("notebooks.share")}</h3>
          <button type="button" onClick={() => setShareNotebookId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {(() => {
          const memberIds = new Set(shareMembers.map((m) => m.userId));
          const available = shareFriends.filter((f) => !memberIds.has(f.id) && f.id !== currentUserId);
          return available.length > 0 ? (
            <div className="flex gap-2">
              <select value={shareInviteUser} onChange={(e) => setShareInviteUser(e.target.value)} className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs">
                <option value="">{t("kanban.selectFriend")}</option>
                {available.map((f) => <option key={f.id} value={f.username ?? f.name}>{f.name}{f.username ? ` (@${f.username})` : ""}</option>)}
              </select>
              <select value={shareInvitePerm} onChange={(e) => setShareInvitePerm(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
                <option value="view">{t("kanban.permView")}</option>
                <option value="edit">{t("kanban.permEdit")}</option>
                <option value="admin">{t("kanban.permAdmin")}</option>
              </select>
              <button type="button" onClick={handleShareInvite} disabled={!shareInviteUser.trim()} className="rounded-md bg-brand px-2 py-1 text-xs text-white hover:bg-brand/90 disabled:opacity-50">{t("kanban.invite")}</button>
            </div>
          ) : <p className="text-xs text-muted-foreground">{t("kanban.noFriendsToInvite")}</p>;
        })()}
        {shareMembers.length > 0 && (
          <div className="space-y-1">
            {shareMembers.map((m) => (
              <div key={m.userId} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50">
                <span className="text-xs font-medium">{m.username}</span>
                <div className="flex items-center gap-1.5">
                  <select value={m.permission} onChange={(e) => handleShareUpdatePerm(m.userId, e.target.value)} className="rounded border border-input bg-background px-1 py-0.5 text-[10px]">
                    <option value="view">{t("kanban.permView")}</option>
                    <option value="edit">{t("kanban.permEdit")}</option>
                    <option value="admin">{t("kanban.permAdmin")}</option>
                  </select>
                  <button type="button" onClick={() => handleShareRemove(m.userId)} className="text-muted-foreground hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  ) : null;

  // If a notebook is selected, show notes for that notebook
  if (selectedNotebook) {
    if (!inline && !open) return null;
    // Create notebook inline dialog
    const createDialog = creating ? (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => { setCreating(false); setNewName(""); }}>
        <div className="bg-background border border-border rounded-lg w-[320px] p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-sm font-semibold">{t("notebooks.create")}</h3>
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setCreating(false); setNewName(""); }
            }}
            placeholder={t("notebooks.namePlaceholder")}
            className="h-8 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setCreating(false); setNewName(""); }} className="rounded-md px-3 py-1 text-xs text-muted-foreground hover:text-foreground">{t("common.cancel")}</button>
            <button type="button" onClick={handleCreate} disabled={!newName.trim()} className="rounded-md px-3 py-1 text-xs font-medium bg-brand text-white hover:bg-brand/90 disabled:opacity-50">{t("notebooks.add")}</button>
          </div>
        </div>
      </div>
    ) : null;

    return (<>{shareDialog}{createDialog}<NotebookNotes
        notebook={selectedNotebook}
        notebooks={notebooks}
        onSwitchNotebook={(nb) => { setSelectedNotebook(nb); }}
        onCreateNotebook={() => setCreating(true)}
        inline={inline}
        onClose={!inline && onOpenChange ? () => onOpenChange(false) : undefined}
        onManageCapsules={handleManageCapsules}
        onManageAgents={handleManageAgents}
        onToggleCapsuleLink={handleToggleCapsuleLink}
        onToggleAgentPermission={handleToggleAgentPermission}
        capsuleSelectorId={capsuleSelectorId}
        setCapsuleSelectorId={setCapsuleSelectorId}
        allCapsules={allCapsules}
        selectedCapsuleIds={selectedCapsuleIds}
        capsuleLoading={capsuleLoading}
        agentSelectorId={agentSelectorId}
        setAgentSelectorId={setAgentSelectorId}
        allAgents={allAgents}
        selectedAgentIds={selectedAgentIds}
        agentLoading={agentLoading}
        onDelete={handleDelete}
        onRefresh={fetchNotebooks}
      />
    </>);
  }

  const content = (
    <div className="flex flex-col h-full">
      {/* Header — shown while loading/no selection */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <BookOpen className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold flex-1">{t("notebooks.title")}</span>
        {!inline && onOpenChange && (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors ml-1"
          >
            ✕
          </button>
        )}
      </div>

      {/* Create input */}
      {creating && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setCreating(false); setNewName(""); }
            }}
            placeholder={t("notebooks.namePlaceholder")}
            className="h-8 text-sm"
          />
          <button
            type="button"
            onClick={handleCreate}
            className="rounded-md px-2 py-1 text-xs font-medium bg-brand text-white hover:bg-brand/90 transition-colors"
          >
            {t("notebooks.add")}
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : notebooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
            <FolderOpen className="h-8 w-8 mb-2 opacity-50" />
            {t("notebooks.empty")}
          </div>
        ) : (
          notebooks.map((nb) => (
            <div key={nb.id} className="group">
              {editingId === nb.id ? (
                <div className="flex items-center gap-2 px-3 py-2">
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(nb.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-7 text-sm flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => handleRename(nb.id)}
                    className="text-xs font-medium text-brand"
                  >
                    {t("notebooks.save")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => selectNotebook(nb)}
                  className="flex items-center w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                >
                  <BookOpen className="h-4 w-4 text-muted-foreground mr-2.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-medium truncate flex items-center gap-1"
                      onDoubleClick={(e) => {
                        if (!nb.isDefault) {
                          e.stopPropagation();
                          setEditingId(nb.id);
                          setEditName(nb.name);
                        }
                      }}
                    >
                      {nb.name}
                      {nb.isDefault && (
                        <span className="text-[10px] text-muted-foreground font-normal">
                          ({t("notebooks.default")})
                        </span>
                      )}
                      {nb.ownerUsername && nb.ownerId !== currentUserId && (
                        <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground font-normal">@{nb.ownerUsername}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      {nb.noteCount} {t("notebooks.noteCount")}
                      {nb.includeInCapsule && <Brain className="h-3 w-3 text-brand/60" />}
                    </div>
                  </div>

                  {/* Context menu */}
                  <Popover open={menuOpenId === nb.id} onOpenChange={(o) => { setMenuOpenId(o ? nb.id : null); if (!o) { setCapsuleSelectorId(null); setAgentSelectorId(null); } }}>
                    <PopoverTrigger asChild>
                      <div
                        role="button"
                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(nb.id); }}
                        className={cn(
                          "rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors",
                          isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        )}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </div>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-1" align="end" side="bottom">
                      {capsuleSelectorId === nb.id ? (
                        <div onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border mb-1">
                            <button type="button" onClick={() => setCapsuleSelectorId(null)} className="hover:text-foreground">
                              <ArrowLeft className="h-3 w-3" />
                            </button>
                            {t("notebooks.manageCapsules")}
                          </div>
                          {capsuleLoading ? (
                            <div className="flex justify-center py-3">
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            </div>
                          ) : allCapsules.length === 0 ? (
                            <div className="px-2 py-2 text-xs text-muted-foreground">{t("notebooks.noCapsules")}</div>
                          ) : (
                            allCapsules.map((cap) => (
                              <button
                                key={cap.id}
                                type="button"
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                                onClick={() => handleToggleCapsuleLink(cap.id)}
                              >
                                <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${selectedCapsuleIds.includes(cap.id) ? "bg-brand border-brand text-white" : "border-muted-foreground/30"}`}>
                                  {selectedCapsuleIds.includes(cap.id) && <Check className="h-2.5 w-2.5" />}
                                </div>
                                <span className="truncate">{cap.name}</span>
                              </button>
                            ))
                          )}
                        </div>
                      ) : agentSelectorId === nb.id ? (
                        <div onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border mb-1">
                            <button type="button" onClick={() => setAgentSelectorId(null)} className="hover:text-foreground">
                              <ArrowLeft className="h-3 w-3" />
                            </button>
                            {t("notebooks.manageAgents")}
                          </div>
                          {agentLoading ? (
                            <div className="flex justify-center py-3">
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            </div>
                          ) : allAgents.length === 0 ? (
                            <div className="px-2 py-2 text-xs text-muted-foreground">{t("notebooks.noAgents")}</div>
                          ) : (
                            <>
                              {allAgents.map((ag) => (
                                <button
                                  key={ag.id}
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                                  onClick={() => handleToggleAgentPermission(ag.id)}
                                >
                                  <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${selectedAgentIds.includes(ag.id) ? "bg-brand border-brand text-white" : "border-muted-foreground/30"}`}>
                                    {selectedAgentIds.includes(ag.id) && <Check className="h-2.5 w-2.5" />}
                                  </div>
                                  <span className="truncate">{ag.name}</span>
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      ) : (
                        <>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleManageCapsules(nb.id);
                          }}
                        >
                          <Brain className={`h-3 w-3 ${nb.includeInCapsule ? "text-brand" : "text-muted-foreground"}`} />
                          {t("notebooks.manageCapsules")}
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleManageAgents(nb.id);
                          }}
                        >
                          <Bot className="h-3 w-3 text-muted-foreground" />
                          {t("notebooks.manageAgents")}
                        </button>
                        {nb.ownerId === currentUserId && (
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShareNotebookId(nb.id);
                              setMenuOpenId(null);
                            }}
                          >
                            <Share2 className="h-3 w-3 text-muted-foreground" />
                            {t("notebooks.share")}
                          </button>
                        )}
                        </>
                      )}
                      {!nb.isDefault && (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(nb.id);
                            setEditName(nb.name);
                            setMenuOpenId(null);
                          }}
                        >
                          <Pencil className="h-3 w-3" /> {t("notebooks.rename")}
                        </button>
                      )}
                      {!nb.isDefault && (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(nb.id);
                            setMenuOpenId(null);
                          }}
                        >
                          <Trash2 className="h-3 w-3" /> {t("notebooks.delete")}
                        </button>
                      )}
                      </PopoverContent>
                    </Popover>
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  // Inline mode (right panel)
  if (inline) return <>{content}{shareDialog}</>;

  // Mobile portal overlay
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {content}
      {shareDialog}
    </div>,
    document.body,
  );
}

/** Notes list inside a specific notebook */
function NotebookNotes({
  notebook,
  notebooks,
  onSwitchNotebook,
  onCreateNotebook,
  inline,
  onClose,
  onManageCapsules,
  onManageAgents,
  onToggleCapsuleLink,
  onToggleAgentPermission,
  capsuleSelectorId,
  setCapsuleSelectorId,
  allCapsules,
  selectedCapsuleIds,
  capsuleLoading,
  agentSelectorId,
  setAgentSelectorId,
  allAgents,
  selectedAgentIds,
  agentLoading,
  onDelete,
  onRefresh,
}: {
  notebook: Notebook;
  notebooks: Notebook[];
  onSwitchNotebook: (nb: Notebook) => void;
  onCreateNotebook: () => void;
  inline?: boolean;
  onClose?: () => void;
  onManageCapsules: (id: string) => void;
  onManageAgents: (id: string) => void;
  onToggleCapsuleLink: (capsuleId: string) => void;
  onToggleAgentPermission: (agentId: string) => void;
  capsuleSelectorId: string | null;
  setCapsuleSelectorId: (id: string | null) => void;
  allCapsules: { id: string; name: string }[];
  selectedCapsuleIds: string[];
  capsuleLoading: boolean;
  agentSelectorId: string | null;
  setAgentSelectorId: (id: string | null) => void;
  allAgents: { id: string; name: string }[];
  selectedAgentIds: string[];
  agentLoading: boolean;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const toolbarBtnClass = "rounded-md px-1.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors flex items-center gap-1";

  // Members sharing state
  const [membersOpen, setMembersOpen] = useState(false);
  const [members, setMembers] = useState<{ userId: string; username: string; permission: string }[]>([]);
  const [friends, setFriends] = useState<{ id: string; name: string; username: string | null }[]>([]);
  const [inviteUser, setInviteUser] = useState("");
  const [invitePerm, setInvitePerm] = useState("view");
  const currentUserId = useChatStore((s) => s.currentUserId);

  const isOwner = notebook.ownerId === currentUserId;
  const perm = notebook.permission ?? "owner";
  const canEdit = isOwner || perm === "edit" || perm === "admin";
  const canManage = isOwner || perm === "admin";

  const fetchMembers = useCallback(async () => {
    try {
      const [data, friendsList] = await Promise.all([
        api<{ owner: unknown; members: { userId: string; username: string; permission: string }[] }>(`/api/notebooks/${notebook.id}/members`),
        api<{ id: string; name: string; username: string | null }[]>("/api/friends").catch(() => []),
      ]);
      setMembers(data.members);
      setFriends(friendsList as { id: string; name: string; username: string | null }[]);
    } catch { /* */ }
  }, [notebook.id]);

  const handleInvite = useCallback(async () => {
    if (!inviteUser.trim()) return;
    try {
      await api(`/api/notebooks/${notebook.id}/members`, { method: "POST", body: JSON.stringify({ username: inviteUser, permission: invitePerm }) });
      setInviteUser("");
      fetchMembers();
    } catch { /* */ }
  }, [inviteUser, invitePerm, notebook.id, fetchMembers]);

  const handleRemoveMember = useCallback(async (userId: string) => {
    try {
      await api(`/api/notebooks/${notebook.id}/members/${userId}`, { method: "DELETE" });
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch { /* */ }
  }, [notebook.id]);

  const handleUpdatePerm = useCallback(async (userId: string, perm: string) => {
    try {
      await api(`/api/notebooks/${notebook.id}/members/${userId}`, { method: "PATCH", body: JSON.stringify({ permission: perm }) });
      setMembers((prev) => prev.map((m) => m.userId === userId ? { ...m, permission: perm } : m));
    } catch { /* */ }
  }, [notebook.id]);

  const [archivedNotes, setArchivedNotes] = useState<{ id: string; title: string }[]>([]);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [archivedLoading, setArchivedLoading] = useState(false);

  const loadArchivedNotes = useCallback(async () => {
    setArchivedLoading(true);
    try {
      const data = await api<{ notes: { id: string; title: string }[] }>(
        `/api/notebooks/${notebook.id}/notes?archived=true`,
        { silent: true },
      );
      setArchivedNotes(data.notes || []);
    } catch {
      setArchivedNotes([]);
    } finally {
      setArchivedLoading(false);
    }
  }, [notebook.id]);

  const handleUnarchiveFromPopover = useCallback(async (noteId: string) => {
    try {
      await api(`/api/notes/${noteId}/unarchive`, { method: "POST" });
      setArchivedNotes((prev) => prev.filter((n) => n.id !== noteId));
      onRefresh();
    } catch {}
  }, [onRefresh]);

  const content = (
    <div className="flex flex-col h-full">
      {/* Header with notebook dropdown + toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border shrink-0">
        {searchOpen ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <Input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); } }}
              placeholder={t("notebooks.searchNotes")}
              className="h-7 text-xs"
            />
            <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(""); }} className={toolbarBtnClass}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold hover:bg-muted transition-colors truncate min-w-0"
                >
                  <span className="truncate">{notebook.name}</span>
                  {notebook.ownerUsername && notebook.ownerId !== currentUserId && (
                    <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground font-normal">@{notebook.ownerUsername}</span>
                  )}
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-w-[260px]">
                {notebooks.map((nb) => (
                  <DropdownMenuItem
                    key={nb.id}
                    onClick={() => onSwitchNotebook(nb)}
                    className={cn("flex items-center gap-2", nb.id === notebook.id && "bg-accent")}
                  >
                    <span className="truncate flex-1">
                      {nb.name}
                      {nb.isDefault && <span className="ml-1 text-[10px] text-muted-foreground">({t("notebooks.default")})</span>}
                    </span>
                    {nb.ownerUsername && nb.ownerId !== currentUserId && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">@{nb.ownerUsername}</span>
                    )}
                    <span className="shrink-0 text-[10px] text-muted-foreground">{nb.noteCount}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onCreateNotebook}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  {t("notebooks.create")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex-1" />

            {/* Toolbar icons */}
            <button type="button" onClick={() => setSearchOpen(true)} className={toolbarBtnClass}>
              <Search className="h-3.5 w-3.5" />
            </button>

            {/* Members */}
            {canManage && (
              <button type="button" className={toolbarBtnClass} onClick={() => { setMembersOpen(true); fetchMembers(); }}>
                <Users className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Agent Permissions — owner/admin only */}
            {canManage && <Popover open={agentSelectorId === notebook.id} onOpenChange={(o) => { if (!o) setAgentSelectorId(null); }}>
              <PopoverTrigger asChild>
                <button type="button" className={toolbarBtnClass} onClick={() => onManageAgents(notebook.id)}>
                  <Bot className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-1" align="end" side="bottom">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border mb-1">
                  {t("notebooks.manageAgents")}
                </div>
                {agentLoading ? (
                  <div className="flex justify-center py-3"><Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /></div>
                ) : allAgents.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">{t("notebooks.noAgents")}</div>
                ) : (
                  <>
                    {allAgents.map((ag) => (
                      <button
                        key={ag.id}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                        onClick={() => onToggleAgentPermission(ag.id)}
                      >
                        <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${selectedAgentIds.includes(ag.id) ? "bg-brand border-brand text-white" : "border-muted-foreground/30"}`}>
                          {selectedAgentIds.includes(ag.id) && <Check className="h-2.5 w-2.5" />}
                        </div>
                        <span className="truncate">{ag.name}</span>
                      </button>
                    ))}
                  </>
                )}
              </PopoverContent>
            </Popover>}

            {/* Capsule Links — owner/admin only */}
            {canManage && <Popover open={capsuleSelectorId === notebook.id} onOpenChange={(o) => { if (!o) setCapsuleSelectorId(null); }}>
              <PopoverTrigger asChild>
                <button type="button" className={toolbarBtnClass} onClick={() => onManageCapsules(notebook.id)}>
                  <Brain className={cn("h-3.5 w-3.5", notebook.includeInCapsule && "text-brand")} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-1" align="end" side="bottom">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border mb-1">
                  {t("notebooks.manageCapsules")}
                </div>
                {capsuleLoading ? (
                  <div className="flex justify-center py-3"><Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /></div>
                ) : allCapsules.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">{t("notebooks.noCapsules")}</div>
                ) : (
                  allCapsules.map((cap) => (
                    <button
                      key={cap.id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                      onClick={() => onToggleCapsuleLink(cap.id)}
                    >
                      <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${selectedCapsuleIds.includes(cap.id) ? "bg-brand border-brand text-white" : "border-muted-foreground/30"}`}>
                        {selectedCapsuleIds.includes(cap.id) && <Check className="h-2.5 w-2.5" />}
                      </div>
                      <span className="truncate">{cap.name}</span>
                    </button>
                  ))
                )}
              </PopoverContent>
            </Popover>}

            {/* Archive popover — show archived notes */}
            <Popover open={archivedOpen} onOpenChange={(o) => { setArchivedOpen(o); if (o) loadArchivedNotes(); }}>
              <PopoverTrigger asChild>
                <button type="button" className={toolbarBtnClass}>
                  <Archive className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-1" align="end" side="bottom">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border mb-1">
                  {t("notebooks.archivedNotes")}
                </div>
                {archivedLoading ? (
                  <div className="flex justify-center py-3"><Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /></div>
                ) : archivedNotes.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground text-center">{t("notebooks.noArchivedNotes")}</div>
                ) : (
                  <div className="max-h-48 overflow-y-auto">
                    {archivedNotes.map((note) => (
                      <div key={note.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors">
                        <span className="truncate flex-1">{note.title || t("chat.notebook.untitled")}</span>
                        <button
                          type="button"
                          className="shrink-0 text-brand hover:text-brand/80 text-[10px] font-medium"
                          onClick={() => handleUnarchiveFromPopover(note.id)}
                        >
                          {t("chat.notebook.unarchive")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Reuse existing NotebookSheet for note list rendering */}
      <div className="flex-1 min-h-0">
        <NotebookSheet
          inline
          open
          hideArchivedTab
          onOpenChange={onClose ? () => onClose() : () => {}}
          notebookId={notebook.id}
          searchQuery={searchQuery}
          includeInCapsule={notebook.includeInCapsule}
          readOnly={!canEdit}
        />
      </div>
    </div>
  );

  const membersDialog = membersOpen ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setMembersOpen(false)}>
      <div className="bg-background border border-border rounded-lg w-[380px] max-h-[400px] overflow-y-auto p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("kanban.boardMembers")}</h3>
          <button type="button" onClick={() => setMembersOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {(() => {
          const memberIds = new Set(members.map((m) => m.userId));
          const available = friends.filter((f) => !memberIds.has(f.id) && f.id !== currentUserId);
          return available.length > 0 ? (
            <div className="flex gap-2">
              <select value={inviteUser} onChange={(e) => setInviteUser(e.target.value)} className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs">
                <option value="">{t("kanban.selectFriend")}</option>
                {available.map((f) => <option key={f.id} value={f.username ?? f.name}>{f.name}{f.username ? ` (@${f.username})` : ""}</option>)}
              </select>
              <select value={invitePerm} onChange={(e) => setInvitePerm(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
                <option value="view">{t("kanban.permView")}</option>
                <option value="edit">{t("kanban.permEdit")}</option>
                <option value="admin">{t("kanban.permAdmin")}</option>
              </select>
              <button type="button" onClick={handleInvite} disabled={!inviteUser.trim()} className="rounded-md bg-brand px-2 py-1 text-xs text-white hover:bg-brand/90 disabled:opacity-50">{t("kanban.invite")}</button>
            </div>
          ) : <p className="text-xs text-muted-foreground">{t("kanban.noFriendsToInvite")}</p>;
        })()}
        {members.length > 0 && (
          <div className="space-y-1">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50">
                <span className="text-xs font-medium">{m.username}</span>
                <div className="flex items-center gap-1.5">
                  <select value={m.permission} onChange={(e) => handleUpdatePerm(m.userId, e.target.value)} className="rounded border border-input bg-background px-1 py-0.5 text-[10px]">
                    <option value="view">{t("kanban.permView")}</option>
                    <option value="edit">{t("kanban.permEdit")}</option>
                    <option value="admin">{t("kanban.permAdmin")}</option>
                  </select>
                  <button type="button" onClick={() => handleRemoveMember(m.userId)} className="text-muted-foreground hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  ) : null;

  // Inline mode (right panel)
  if (inline) return <>{content}{membersDialog}</>;

  // Mobile portal overlay
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {content}
      {membersDialog}
    </div>,
    document.body,
  );
}
