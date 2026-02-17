"use client";

import { useState, useRef, useEffect } from "react";
import { useChatStore } from "@/store/chat-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  Camera,
  Check,
  Copy,
  Circle,
  Loader2,
  RefreshCw,
  Plus,
  X,
  Download,
  Trash2,
  Bell,
  BellOff,
  Globe,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { BACKEND_URL } from "@/lib/config";

const CATEGORIES = [
  { value: "assistant", label: "AI Assistant" },
  { value: "coding", label: "Coding" },
  { value: "translation", label: "Translation" },
  { value: "writing", label: "Writing" },
  { value: "research", label: "Research" },
  { value: "entertainment", label: "Entertainment" },
  { value: "utility", label: "Utility" },
  { value: "other", label: "Other" },
];

interface BotManageDialogProps {
  agent: {
    id: string;
    name: string;
    description: string | null;
    avatarUrl: string | null;
    a2aEndpoint: string | null;
    pairingCode: string | null;
    pairingCodeExpiresAt: string | Date | null;
    secretToken: string | null;
    isPublic: boolean;
    category: string | null;
    systemPrompt: string | null;
    welcomeMessage: string | null;
    quickReplies: { label: string; message: string }[] | null;
    notificationsEnabled: boolean;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AgentStats {
  totalMessages: number;
  totalConversations: number;
  lastActive: string | null;
}

export function BotManageDialog({
  agent,
  open,
  onOpenChange,
}: BotManageDialogProps) {
  const updateAgent = useChatStore((s) => s.updateAgent);
  const deleteAgent = useChatStore((s) => s.deleteAgent);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const agentHealth = useChatStore((s) => s.agentHealth);

  // Profile fields
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? "");
  const [category, setCategory] = useState(agent.category ?? "");
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt ?? "");
  const [welcomeMessage, setWelcomeMessage] = useState(agent.welcomeMessage ?? "");
  const [quickReplies, setQuickReplies] = useState<{ label: string; message: string }[]>(
    agent.quickReplies ?? []
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(agent.notificationsEnabled);
  const [isPublic, setIsPublic] = useState(agent.isPublic);

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState(agent.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pairing code
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [localPairingCode, setLocalPairingCode] = useState(agent.pairingCode);
  const [localExpiresAt, setLocalExpiresAt] = useState(agent.pairingCodeExpiresAt);

  // Bot token
  const [localToken, setLocalToken] = useState(agent.secretToken);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [regeneratingToken, setRegeneratingToken] = useState(false);

  // UI state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Stats
  const [stats, setStats] = useState<AgentStats | null>(null);

  // Quick reply editing
  const [newQrLabel, setNewQrLabel] = useState("");
  const [newQrMessage, setNewQrMessage] = useState("");

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setName(agent.name);
      setDescription(agent.description ?? "");
      setCategory(agent.category ?? "");
      setSystemPrompt(agent.systemPrompt ?? "");
      setWelcomeMessage(agent.welcomeMessage ?? "");
      setQuickReplies(agent.quickReplies ?? []);
      setNotificationsEnabled(agent.notificationsEnabled);
      setIsPublic(agent.isPublic);
      setAvatarUrl(agent.avatarUrl);
      setSaved(false);
      setError("");
      setDeleteConfirm(false);
      setClearConfirm(false);
      setDeleting(false);
      setClearing(false);
      setLocalPairingCode(agent.pairingCode);
      setLocalExpiresAt(agent.pairingCodeExpiresAt);
      setLocalToken(agent.secretToken);
      setShowToken(false);
      setRegeneratingToken(false);
      setNewQrLabel("");
      setNewQrMessage("");

      // Load stats
      api<AgentStats>(`/api/agents/${agent.id}/stats`)
        .then(setStats)
        .catch(() => setStats(null));
    }
  }, [open, agent]);

  const hasChanges =
    name !== agent.name ||
    (description || null) !== (agent.description || null) ||
    (category || null) !== (agent.category || null) ||
    (systemPrompt || null) !== (agent.systemPrompt || null) ||
    (welcomeMessage || null) !== (agent.welcomeMessage || null) ||
    JSON.stringify(quickReplies) !== JSON.stringify(agent.quickReplies ?? []) ||
    notificationsEnabled !== agent.notificationsEnabled ||
    isPublic !== agent.isPublic;

  const handleAvatarUpload = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api<{ avatarUrl: string }>(
        `/api/agents/${agent.id}/avatar`,
        { method: "POST", body: formData }
      );
      setAvatarUrl(result.avatarUrl);
      await useChatStore.getState().loadAgents();
      await useChatStore.getState().loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload avatar");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateAgent(agent.id, {
        name,
        description: description || null,
        category: category || null,
        systemPrompt: systemPrompt || null,
        welcomeMessage: welcomeMessage || null,
        quickReplies: quickReplies.length > 0 ? quickReplies : null,
        notificationsEnabled,
        isPublic,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await deleteAgent(agent.id);
      await loadConversations();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete bot");
      setDeleting(false);
    }
  };

  const handleClearHistory = async () => {
    setClearing(true);
    setError("");
    try {
      await api(`/api/agents/${agent.id}/history`, { method: "DELETE" });
      await loadConversations();
      setClearConfirm(false);
      // Refresh stats
      api<AgentStats>(`/api/agents/${agent.id}/stats`)
        .then(setStats)
        .catch(() => setStats(null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear history");
    } finally {
      setClearing(false);
    }
  };

  const handleExport = async (format: "json" | "markdown") => {
    setExporting(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/agents/${agent.id}/export?format=${format}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const ext = format === "markdown" ? "md" : "json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${agent.name}-export.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export");
    } finally {
      setExporting(false);
    }
  };

  const handleCopyPairingCode = async () => {
    if (!localPairingCode) return;
    await navigator.clipboard.writeText(localPairingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const addQuickReply = () => {
    if (!newQrLabel.trim() || !newQrMessage.trim()) return;
    if (quickReplies.length >= 10) return;
    setQuickReplies([...quickReplies, { label: newQrLabel.trim(), message: newQrMessage.trim() }]);
    setNewQrLabel("");
    setNewQrMessage("");
  };

  const removeQuickReply = (index: number) => {
    setQuickReplies(quickReplies.filter((_, i) => i !== index));
  };

  const health = agentHealth[agent.id];
  const isConnected = health?.status === "online";

  const formatLastActive = (date: string | null) => {
    if (!date) return "Never";
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Manage Bot</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 min-w-0">
          {error && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Avatar */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative flex h-20 w-20 items-center justify-center rounded-full bg-neutral-700 overflow-hidden transition-opacity hover:opacity-80"
              disabled={uploading}
            >
              {avatarUrl ? (
                <img
                  src={`${BACKEND_URL}${avatarUrl}`}
                  alt={name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Bot className="h-8 w-8 text-neutral-300" />
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                ) : (
                  <Camera className="h-5 w-5 text-white" />
                )}
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAvatarUpload(file);
                e.target.value = "";
              }}
            />
            <p className="text-xs text-muted-foreground">Click to change avatar</p>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bot name"
              className="bg-neutral-800 border-none"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this bot do?"
              className="bg-neutral-800 border-none min-h-[60px] resize-none"
              rows={2}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-neutral-800 border-none">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <label className="text-sm font-medium">System Prompt</label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Define the bot's behavior, role, language..."
              className="bg-neutral-800 border-none min-h-[80px] resize-none text-sm"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Prepended to every message sent to this bot.
            </p>
          </div>

          {/* Welcome Message */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Welcome Message</label>
            <Textarea
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder="Auto-sent when a new conversation starts..."
              className="bg-neutral-800 border-none min-h-[60px] resize-none text-sm"
              rows={2}
            />
          </div>

          {/* Quick Replies */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Quick Replies
              <span className="ml-1 text-xs text-muted-foreground">
                ({quickReplies.length}/10)
              </span>
            </label>
            {quickReplies.length > 0 && (
              <div className="space-y-1.5">
                {quickReplies.map((qr, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg bg-neutral-800/50 px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{qr.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground truncate">
                        {qr.message}
                      </span>
                    </div>
                    <button onClick={() => removeQuickReply(i)} className="shrink-0 text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {quickReplies.length < 10 && (
              <div className="flex gap-2">
                <Input
                  value={newQrLabel}
                  onChange={(e) => setNewQrLabel(e.target.value)}
                  placeholder="Label"
                  className="bg-neutral-800 border-none text-sm flex-[1] min-w-0"
                />
                <Input
                  value={newQrMessage}
                  onChange={(e) => setNewQrMessage(e.target.value)}
                  placeholder="Message"
                  className="bg-neutral-800 border-none text-sm flex-[2] min-w-0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addQuickReply();
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={addQuickReply}
                  disabled={!newQrLabel.trim() || !newQrMessage.trim()}
                  className="shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Toggles: Notifications + Public */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setNotificationsEnabled(!notificationsEnabled)}
              className="flex w-full items-center justify-between rounded-lg bg-neutral-800/50 px-4 py-3 transition-colors hover:bg-neutral-800"
            >
              <div className="flex items-center gap-3">
                {notificationsEnabled ? (
                  <Bell className="h-4 w-4 text-foreground" />
                ) : (
                  <BellOff className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm">Notifications</span>
              </div>
              <div
                className={cn(
                  "h-5 w-9 rounded-full transition-colors relative",
                  notificationsEnabled ? "bg-primary" : "bg-neutral-600"
                )}
              >
                <div
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                    notificationsEnabled ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              </div>
            </button>
            <button
              type="button"
              onClick={() => setIsPublic(!isPublic)}
              className="flex w-full items-center justify-between rounded-lg bg-neutral-800/50 px-4 py-3 transition-colors hover:bg-neutral-800"
            >
              <div className="flex items-center gap-3">
                {isPublic ? (
                  <Globe className="h-4 w-4 text-foreground" />
                ) : (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="text-left">
                  <span className="text-sm">
                    {isPublic ? "Public" : "Private"}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {isPublic
                      ? "Discoverable in marketplace"
                      : "Only you can use this bot"}
                  </p>
                </div>
              </div>
              <div
                className={cn(
                  "h-5 w-9 rounded-full transition-colors relative",
                  isPublic ? "bg-primary" : "bg-neutral-600"
                )}
              >
                <div
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                    isPublic ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              </div>
            </button>
          </div>

          {/* Usage Stats */}
          {stats && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Usage</label>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-neutral-800/50 px-3 py-2 text-center">
                  <p className="text-lg font-semibold">{stats.totalMessages}</p>
                  <p className="text-xs text-muted-foreground">Messages</p>
                </div>
                <div className="rounded-lg bg-neutral-800/50 px-3 py-2 text-center">
                  <p className="text-lg font-semibold">{stats.totalConversations}</p>
                  <p className="text-xs text-muted-foreground">Chats</p>
                </div>
                <div className="rounded-lg bg-neutral-800/50 px-3 py-2 text-center">
                  <p className="text-sm font-semibold">{formatLastActive(stats.lastActive)}</p>
                  <p className="text-xs text-muted-foreground">Last Active</p>
                </div>
              </div>
            </div>
          )}

          {/* Connection status */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Connection</label>
            <div className="rounded-lg bg-neutral-800/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Circle
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 fill-current",
                    isConnected ? "text-green-500" : "text-neutral-500"
                  )}
                />
                <span className="text-sm">
                  {isConnected ? "Connected" : "Not connected"}
                </span>
              </div>
            </div>
          </div>

          {/* Bot Token (permanent, for reconnection) */}
          {(() => {
            const handleCopyToken = async () => {
              if (!localToken) return;
              await navigator.clipboard.writeText(localToken);
              setTokenCopied(true);
              setTimeout(() => setTokenCopied(false), 2000);
            };

            const handleRegenerateToken = async () => {
              setRegeneratingToken(true);
              setError("");
              try {
                const result = await api<{ secretToken: string }>(
                  `/api/agents/${agent.id}/regenerate-token`,
                  { method: "POST" }
                );
                setLocalToken(result.secretToken);
                await useChatStore.getState().loadAgents();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to regenerate token");
              } finally {
                setRegeneratingToken(false);
              }
            };

            return (
              <div className="space-y-2">
                <label className="text-sm font-medium">Bot Token</label>
                {localToken ? (
                  <>
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 rounded-lg bg-neutral-800 px-3 py-2 text-xs font-mono truncate select-all">
                        {showToken ? localToken : "ari_" + "•".repeat(40)}
                      </code>
                      <Button variant="outline" size="icon" onClick={() => setShowToken(!showToken)} className="shrink-0">
                        {showToken ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                      </Button>
                      <Button variant="outline" size="icon" onClick={handleCopyToken} className="shrink-0">
                        {tokenCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Permanent token. Use in OpenClaw config to connect this bot.
                    </p>
                    <Button variant="outline" size="sm" onClick={handleRegenerateToken} disabled={regeneratingToken} className="gap-2">
                      {regeneratingToken ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Regenerate Token
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">No token available.</p>
                )}
              </div>
            );
          })()}

          {/* Pairing Code (one-time, for first-time setup) */}
          {(() => {
            const isExpired = localExpiresAt
              ? new Date(localExpiresAt) < new Date()
              : !localPairingCode;
            const hasCode = !!localPairingCode && !isExpired;

            const handleRegenerate = async () => {
              setRegenerating(true);
              setError("");
              try {
                const result = await api<{ pairingCode: string; expiresAt: string }>(
                  `/api/agents/${agent.id}/regenerate-code`,
                  { method: "POST" }
                );
                setLocalPairingCode(result.pairingCode);
                setLocalExpiresAt(result.expiresAt);
                await useChatStore.getState().loadAgents();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to regenerate code");
              } finally {
                setRegenerating(false);
              }
            };

            return (
              <div className="space-y-2">
                <label className="text-sm font-medium">Pairing Code</label>
                {hasCode ? (
                  <>
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 rounded-lg bg-neutral-800 px-3 py-2 text-center text-lg font-mono tracking-widest select-all">
                        {localPairingCode}
                      </code>
                      <Button variant="outline" size="icon" onClick={handleCopyPairingCode} className="shrink-0">
                        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Expires in 15 minutes. One-time use for first-time setup.
                    </p>
                  </>
                ) : (
                  <div className="rounded-lg bg-neutral-800/50 px-4 py-3 text-center">
                    <p className="text-sm text-muted-foreground mb-3">
                      {isExpired ? "Pairing code expired." : "No active pairing code."}
                    </p>
                    <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={regenerating} className="gap-2">
                      {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Generate New Code
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Save button */}
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving || !name.trim()}
            className="w-full"
          >
            {saving ? (
              "Saving..."
            ) : saved ? (
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4" /> Saved
              </span>
            ) : (
              "Save Changes"
            )}
          </Button>

          {/* Export */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Export</label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => handleExport("json")}
                disabled={exporting}
              >
                <Download className="h-4 w-4" />
                JSON
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => handleExport("markdown")}
                disabled={exporting}
              >
                <Download className="h-4 w-4" />
                Markdown
              </Button>
            </div>
          </div>

          {/* Danger zone */}
          <div className="space-y-3 rounded-lg border border-destructive/30 p-3 sm:p-4">
            <p className="text-sm font-medium text-destructive">Danger Zone</p>

            {/* Clear History */}
            {!clearConfirm ? (
              <Button
                variant="outline"
                className="w-full gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => setClearConfirm(true)}
              >
                <Trash2 className="h-4 w-4" />
                Clear All History
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Delete all conversations with this bot?
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setClearConfirm(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" className="flex-1" disabled={clearing} onClick={handleClearHistory}>
                    {clearing ? "Clearing..." : "Confirm"}
                  </Button>
                </div>
              </div>
            )}

            {/* Delete Bot */}
            {!deleteConfirm ? (
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setDeleteConfirm(true)}
              >
                Delete Bot
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Are you sure? This will delete all conversations with this bot.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" className="flex-1" disabled={deleting} onClick={handleDelete}>
                    {deleting ? "Deleting..." : "Confirm Delete"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
