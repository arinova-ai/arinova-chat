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
import { Bot, Camera, Check, Copy, Circle, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

const BACKEND_URL = "http://localhost:3501";

interface BotManageDialogProps {
  agent: {
    id: string;
    name: string;
    description: string | null;
    avatarUrl: string | null;
    a2aEndpoint: string | null;
    pairingCode: string | null;
    pairingCodeExpiresAt: string | Date | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? "");
  const [avatarUrl, setAvatarUrl] = useState(agent.avatarUrl);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [localPairingCode, setLocalPairingCode] = useState(agent.pairingCode);
  const [localExpiresAt, setLocalExpiresAt] = useState(agent.pairingCodeExpiresAt);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when agent changes or dialog opens
  useEffect(() => {
    if (open) {
      setName(agent.name);
      setDescription(agent.description ?? "");
      setAvatarUrl(agent.avatarUrl);
      setSaved(false);
      setError("");
      setDeleteConfirm(false);
      setDeleting(false);
      setLocalPairingCode(agent.pairingCode);
      setLocalExpiresAt(agent.pairingCodeExpiresAt);
    }
  }, [open, agent]);

  const hasChanges =
    name !== agent.name ||
    (description || null) !== (agent.description || null);

  const handleAvatarUpload = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api<{ avatarUrl: string }>(
        `/api/agents/${agent.id}/avatar`,
        {
          method: "POST",
          body: formData,
        }
      );
      setAvatarUrl(result.avatarUrl);
      // Refresh agents and conversations to reflect new avatar
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

  const handleCopyPairingCode = async () => {
    if (!agent.pairingCode) return;
    await navigator.clipboard.writeText(agent.pairingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const health = agentHealth[agent.id];
  const isConnected = agent.a2aEndpoint && health?.status === "online";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Bot</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
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
            <p className="text-xs text-muted-foreground">
              Click to change avatar
            </p>
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
              {agent.a2aEndpoint && (
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {agent.a2aEndpoint}
                </p>
              )}
            </div>
          </div>

          {/* Pairing code (if not connected) */}
          {!agent.a2aEndpoint && (() => {
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
                      <code className="flex-1 rounded-lg bg-neutral-800 px-3 py-2 text-center text-lg font-mono tracking-widest select-all">
                        {localPairingCode}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopyPairingCode}
                        className="shrink-0"
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Expires in 15 minutes. Use this code to connect your AI agent.
                    </p>
                  </>
                ) : (
                  <div className="rounded-lg bg-neutral-800/50 px-4 py-3 text-center">
                    <p className="text-sm text-muted-foreground mb-3">
                      {isExpired ? "Pairing code expired." : "No active pairing code."}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRegenerate}
                      disabled={regenerating}
                      className="gap-2"
                    >
                      {regenerating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
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
                <Check className="h-4 w-4" />
                Saved
              </span>
            ) : (
              "Save Changes"
            )}
          </Button>

          {/* Danger zone */}
          <div className="space-y-3 rounded-lg border border-destructive/30 p-4">
            <p className="text-sm font-medium text-destructive">Danger Zone</p>
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
                  Are you sure? This will delete all conversations with this
                  bot.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setDeleteConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    disabled={deleting}
                    onClick={handleDelete}
                  >
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
