"use client";

import { useState, useRef, useEffect } from "react";
import { useChatStore } from "@/store/chat-store";
import { compressImage } from "@/lib/image-compress";
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
  HelpCircle,
  Loader2,
  RefreshCw,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { assetUrl, AGENT_DEFAULT_AVATAR } from "@/lib/config";

/** Popover that opens on hover (desktop) and tap (mobile). */
function HoverPopover({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground transition-colors"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 text-xs text-muted-foreground p-3"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}

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
    category: string | null;
    systemPrompt: string | null;
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
  const { t } = useTranslation();
  const updateAgent = useChatStore((s) => s.updateAgent);
  const deleteAgent = useChatStore((s) => s.deleteAgent);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const agentHealth = useChatStore((s) => s.agentHealth);

  // Profile fields
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? "");
  const [category, setCategory] = useState(agent.category ?? "");
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt ?? "");

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState(agent.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bot token (fetched on demand, never stored in global state)
  const [localToken, setLocalToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
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

  // Stats
  const [stats, setStats] = useState<AgentStats | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setName(agent.name);
      setDescription(agent.description ?? "");
      setCategory(agent.category ?? "");
      setSystemPrompt(agent.systemPrompt ?? "");
      setAvatarUrl(agent.avatarUrl);
      setSaved(false);
      setError("");
      setDeleteConfirm(false);
      setClearConfirm(false);
      setDeleting(false);
      setClearing(false);
      setLocalToken(null);
      setShowToken(false);
      setTokenLoading(false);
      setRegeneratingToken(false);
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
    (systemPrompt || null) !== (agent.systemPrompt || null);

  const handleAvatarUpload = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const compressed = await compressImage(file, { maxWidth: 512, maxHeight: 512, quality: 0.9 });
      const formData = new FormData();
      formData.append("file", compressed);
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
      <DialogContent className="top-[calc(env(safe-area-inset-top,0px)+2.25rem)] translate-y-0 sm:top-[50%] sm:translate-y-[-50%] sm:max-w-md max-h-[calc(100dvh-env(safe-area-inset-top,0px)-3.25rem)] sm:max-h-[85vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{t("botManage.title")}</DialogTitle>
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
              className="group relative flex h-20 w-20 items-center justify-center rounded-full bg-accent overflow-hidden transition-opacity hover:opacity-80"
              disabled={uploading}
            >
              <img
                src={avatarUrl ? assetUrl(avatarUrl) : AGENT_DEFAULT_AVATAR}
                alt={name}
                className="h-full w-full object-cover"
              />
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
            <p className="text-xs text-muted-foreground">{t("botManage.clickChangeAvatar")}</p>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("botManage.name")}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("botManage.namePlaceholder")}
              className="bg-secondary border-none"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("botManage.description")}</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("botManage.descPlaceholder")}
              className="bg-secondary border-none min-h-[60px] resize-none"
              rows={2}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-sm font-medium">
              {t("botManage.category")}
              <HoverPopover content={t("botManage.categoryTooltip")} />
            </label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-secondary border-none">
                <SelectValue placeholder={t("botManage.selectCategory")} />
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
            <label className="flex items-center gap-1.5 text-sm font-medium">
              {t("botManage.systemPrompt")}
              <HoverPopover content={t("botManage.systemPromptTooltip")} />
            </label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t("botManage.systemPromptPlaceholder")}
              className="bg-secondary border-none min-h-[80px] resize-none text-sm"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              {t("botManage.systemPromptHint")}
            </p>
          </div>


          {/* Usage Stats */}
          {stats && (
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("botManage.usage")}</label>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-secondary/50 px-3 py-2 text-center">
                  <p className="text-lg font-semibold">{stats.totalMessages}</p>
                  <p className="text-xs text-muted-foreground">{t("botManage.messages")}</p>
                </div>
                <div className="rounded-lg bg-secondary/50 px-3 py-2 text-center">
                  <p className="text-lg font-semibold">{stats.totalConversations}</p>
                  <p className="text-xs text-muted-foreground">{t("botManage.chats")}</p>
                </div>
                <div className="rounded-lg bg-secondary/50 px-3 py-2 text-center">
                  <p className="text-sm font-semibold">{formatLastActive(stats.lastActive)}</p>
                  <p className="text-xs text-muted-foreground">{t("botManage.lastActive")}</p>
                </div>
              </div>
            </div>
          )}

          {/* Connection status */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("botManage.connection")}</label>
            <div className="rounded-lg bg-secondary/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Circle
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 fill-current",
                    isConnected ? "text-green-500" : "text-muted-foreground"
                  )}
                />
                <span className="text-sm">
                  {isConnected ? t("botManage.connected") : t("botManage.notConnected")}
                </span>
              </div>
            </div>
          </div>

          {/* Bot Token (fetched on demand, never in global state) */}
          {(() => {
            const handleFetchToken = async () => {
              setTokenLoading(true);
              try {
                const result = await api<{ secretToken: string }>(
                  `/api/agents/${agent.id}/token`
                );
                setLocalToken(result.secretToken);
                setShowToken(true);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to fetch token");
              } finally {
                setTokenLoading(false);
              }
            };

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
                setShowToken(true);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to regenerate token");
              } finally {
                setRegeneratingToken(false);
              }
            };

            return (
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("botManage.botToken")}</label>
                {localToken ? (
                  <>
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 rounded-lg bg-secondary px-3 py-2 text-xs font-mono truncate select-all">
                        {showToken ? localToken : "ari_" + "•".repeat(40)}
                      </code>
                      <Button variant="outline" size="icon" onClick={() => setShowToken(!showToken)} className="shrink-0">
                        {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button variant="outline" size="icon" onClick={handleCopyToken} className="shrink-0">
                        {tokenCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("botManage.tokenHint")}
                    </p>
                    <Button variant="outline" size="sm" onClick={handleRegenerateToken} disabled={regeneratingToken} className="gap-2">
                      {regeneratingToken ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      {t("botManage.regenerateToken")}
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleFetchToken} disabled={tokenLoading} className="gap-2">
                    {tokenLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                    {t("botManage.showToken")}
                  </Button>
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
              t("common.saving")
            ) : saved ? (
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4" /> {t("common.saved")}
              </span>
            ) : (
              t("common.save")
            )}
          </Button>

          {/* Danger zone */}
          <div className="space-y-3 rounded-lg border border-destructive/30 p-3 sm:p-4">
            <p className="text-sm font-medium text-destructive">{t("botManage.dangerZone")}</p>

            {/* Clear History */}
            {!clearConfirm ? (
              <Button
                variant="outline"
                className="w-full gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => setClearConfirm(true)}
              >
                <Trash2 className="h-4 w-4" />
                {t("botManage.clearHistory")}
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {t("botManage.clearHistoryConfirm")}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setClearConfirm(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button variant="destructive" className="flex-1" disabled={clearing} onClick={handleClearHistory}>
                    {clearing ? t("common.clearing") : t("common.confirm")}
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
                {t("botManage.deleteBot")}
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {t("botManage.deleteBotConfirm")}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button variant="destructive" className="flex-1" disabled={deleting} onClick={handleDelete}>
                    {deleting ? t("common.deleting") : t("botManage.confirmDelete")}
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
