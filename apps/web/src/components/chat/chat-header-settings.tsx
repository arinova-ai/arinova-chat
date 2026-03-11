"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useHeaderPinStore } from "@/store/header-pin-store";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";
import { assetUrl, BACKEND_URL } from "@/lib/config";
import {
  ArrowLeft, Search, Bell, SquareKanban, BookOpen, MessageSquare,
  Phone, Image as ImageIcon, FileText, Brain, Pin, Upload, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Keep HEADER_BUTTONS export exactly as is
interface HeaderButton {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  supportedTypes: ("h2h" | "h2a")[];
}

export const HEADER_BUTTONS: HeaderButton[] = [
  { id: "search", labelKey: "chat.search.inConversation", icon: Search, supportedTypes: ["h2h", "h2a"] },
  { id: "mute", labelKey: "chat.header.muteConversation", icon: Bell, supportedTypes: ["h2h", "h2a"] },
  { id: "kanban", labelKey: "chat.kanban.title", icon: SquareKanban, supportedTypes: ["h2h", "h2a"] },
  { id: "notebook", labelKey: "chat.notebook.title", icon: BookOpen, supportedTypes: ["h2h", "h2a"] },
  { id: "threads", labelKey: "chat.thread.title", icon: MessageSquare, supportedTypes: ["h2h", "h2a"] },
  { id: "call", labelKey: "voice.startCall", icon: Phone, supportedTypes: ["h2h"] },
  { id: "photos", labelKey: "chat.header.photos", icon: ImageIcon, supportedTypes: ["h2h", "h2a"] },
  { id: "files", labelKey: "chat.header.files", icon: FileText, supportedTypes: ["h2h", "h2a"] },
  { id: "capsule", labelKey: "memoryCapsule.title", icon: Brain, supportedTypes: ["h2a"] },
];

interface ChatHeaderSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId?: string;
}

export function ChatHeaderSettings({ open, onOpenChange, conversationId }: ChatHeaderSettingsProps) {
  const { t } = useTranslation();
  const pinnedIds = useHeaderPinStore((s) => s.pinnedIds);
  const togglePin = useHeaderPinStore((s) => s.togglePin);
  const maxReached = pinnedIds.length >= 5;
  const [activeTab, setActiveTab] = useState<"pins" | "appearance">("pins");

  // Background state
  const [chatBgUrl, setChatBgUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Load current bg settings
  useEffect(() => {
    if (!open || !conversationId) return;
    api<{ chatBgUrl: string | null }>(`/api/conversations/${conversationId}/settings`, { silent: true })
      .then((d) => setChatBgUrl(d.chatBgUrl))
      .catch(() => {});
  }, [open, conversationId]);

  const handleUploadBg = useCallback(async (file: File) => {
    if (!conversationId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch(
        `${BACKEND_URL}/api/conversations/${conversationId}/upload`,
        { method: "POST", body: formData, credentials: "include" }
      );
      const uploadData = await uploadRes.json();
      const newUrl = uploadData.url as string;
      await api(`/api/conversations/${conversationId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({ chatBgUrl: newUrl }),
      });
      setChatBgUrl(newUrl);
    } catch {}
    setUploading(false);
  }, [conversationId]);

  const handleClearBg = useCallback(async () => {
    if (!conversationId) return;
    try {
      await api(`/api/conversations/${conversationId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({ chatBgUrl: null }),
      });
      setChatBgUrl(null);
    } catch {}
  }, [conversationId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">{t("chat.header.settings")}</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          type="button"
          className={cn(
            "flex-1 px-4 py-2.5 text-sm font-medium transition-colors",
            activeTab === "pins" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveTab("pins")}
        >
          {t("chat.header.pinnedButtons")}
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 px-4 py-2.5 text-sm font-medium transition-colors",
            activeTab === "appearance" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveTab("appearance")}
        >
          {t("chat.settings.appearance")}
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "pins" && (
          <div>
            <p className="mb-4 text-xs text-muted-foreground">{t("chat.header.pinnedButtonsDesc")}</p>
            <div className="flex flex-col gap-1">
              {HEADER_BUTTONS.map((btn) => {
                const Icon = btn.icon;
                const isPinned = pinnedIds.includes(btn.id);
                const disabled = !isPinned && maxReached;
                const types = btn.supportedTypes.join(" / ").toUpperCase();
                return (
                  <label
                    key={btn.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/60"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{t(btn.labelKey)}</p>
                      <p className="text-[10px] text-muted-foreground">{types}</p>
                    </div>
                    <Switch
                      checked={isPinned}
                      disabled={disabled}
                      onCheckedChange={() => togglePin(btn.id)}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "appearance" && (
          <div>
            <h3 className="mb-3 text-sm font-medium">{t("chat.settings.chatBackground")}</h3>

            {/* Current preview */}
            <div className="mb-4 overflow-hidden rounded-lg border border-border">
              <div
                className="relative flex h-40 items-center justify-center"
                style={chatBgUrl ? {
                  backgroundImage: `url(${assetUrl(chatBgUrl)})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                } : { backgroundColor: "black" }}
              >
                <div className="absolute inset-0 bg-black/40" />
                <p className="relative text-xs text-white/70">{t("chat.settings.preview")}</p>
              </div>
            </div>

            {/* Options */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                  !chatBgUrl ? "border-primary bg-primary/10" : "border-border hover:bg-accent/60"
                )}
                onClick={handleClearBg}
              >
                <div className="h-8 w-8 rounded bg-black" />
                <span className="text-sm">{t("chat.settings.defaultBg")}</span>
              </button>

              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
                  chatBgUrl ? "border-primary bg-primary/10" : "border-border hover:bg-accent/60"
                )}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded bg-accent">
                  <Upload className="h-4 w-4" />
                </div>
                <span className="text-sm">
                  {uploading ? "..." : t("chat.settings.customImage")}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadBg(file);
                    e.target.value = "";
                  }}
                />
              </label>

              {chatBgUrl && (
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-red-400 hover:bg-red-400/10"
                  onClick={handleClearBg}
                >
                  <X className="h-4 w-4" />
                  {t("chat.settings.removeBg")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
