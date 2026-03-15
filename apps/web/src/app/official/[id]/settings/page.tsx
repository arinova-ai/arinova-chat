"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/lib/i18n";
import { useAccountStore } from "@/store/account-store";
import { api } from "@/lib/api";

type Tab = "general" | "auto-reply" | "danger";

export default function OfficialSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const { updateAccount, deleteAccount } = useAccountStore();

  const accountId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("general");

  // General
  const [isPublic, setIsPublic] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  // Auto-reply
  const [welcomeEnabled, setWelcomeEnabled] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState("");

  // Danger
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    async function loadAccount() {
      try {
        const account = await api<{
          id: string;
          name: string;
          bio: string | null;
          avatar: string | null;
          isPublic: boolean;
          welcomeMessage: string | null;
        }>(`/api/accounts/${accountId}`);
        setName(account.name ?? "");
        setBio(account.bio ?? "");
        setAvatarUrl(account.avatar ?? "");
        setIsPublic(account.isPublic ?? false);
        setWelcomeEnabled(!!account.welcomeMessage);
        setWelcomeMessage(account.welcomeMessage ?? "");
      } catch (err) {
        console.error("Failed to load account:", err);
      } finally {
        setLoading(false);
      }
    }
    loadAccount();
  }, [accountId]);

  const handleSaveGeneral = useCallback(async () => {
    setSaving(true);
    try {
      await updateAccount(accountId, {
        isPublic,
        name,
        bio,
        avatar: avatarUrl || null,
      });
    } catch (err) {
      console.error("Failed to save general settings:", err);
    } finally {
      setSaving(false);
    }
  }, [accountId, isPublic, name, bio, avatarUrl, updateAccount]);

  const handleSaveAutoReply = useCallback(async () => {
    setSaving(true);
    try {
      await updateAccount(accountId, {
        welcomeMessage: welcomeEnabled ? welcomeMessage : null,
      });
    } catch (err) {
      console.error("Failed to save auto-reply settings:", err);
    } finally {
      setSaving(false);
    }
  }, [accountId, welcomeEnabled, welcomeMessage, updateAccount]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteAccount(accountId);
      router.push("/");
    } catch (err) {
      console.error("Failed to delete account:", err);
    }
  }, [accountId, deleteAccount, router]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background pt-[env(safe-area-inset-top)]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b px-4 py-3 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">{t("official.settings.title")}</h1>
      </header>

      {/* Tab Bar */}
      <div className="flex border-b border-border px-4 shrink-0">
        {(
          [
            { id: "general", label: t("official.settings.general") },
            { id: "auto-reply", label: t("official.settings.autoReply") },
            { id: "danger", label: t("official.settings.dangerZone") },
          ] as const
        ).map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            className={`px-3 py-2.5 text-sm border-b-2 transition-colors ${
              tab === tb.id
                ? "border-brand text-brand"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="mx-auto max-w-2xl space-y-6 p-4">
          {/* ==================== General Tab ==================== */}
          {tab === "general" && (
            <>
              {/* Public toggle */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium">
                    {t("official.settings.public")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("official.settings.publicDesc")}
                  </p>
                </div>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>

              {/* Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("common.name")}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>

              {/* Description / Bio */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("accounts.bio")}
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>

              {/* Avatar URL */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Avatar URL</label>
                <input
                  type="text"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>

              {/* Save */}
              <Button onClick={handleSaveGeneral} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "..." : t("common.save")}
              </Button>
            </>
          )}

          {/* ==================== Auto-Reply Tab ==================== */}
          {tab === "auto-reply" && (
            <>
              {/* Welcome message toggle */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium">
                    {t("official.settings.welcomeToggle")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("official.settings.welcomeDesc")}
                  </p>
                </div>
                <Switch
                  checked={welcomeEnabled}
                  onCheckedChange={setWelcomeEnabled}
                />
              </div>

              {/* Welcome message */}
              {welcomeEnabled && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t("official.settings.welcomeMessage")}
                  </label>
                  <textarea
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    rows={4}
                    placeholder={t("official.settings.welcomePlaceholder")}
                    className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                </div>
              )}

              {/* Link to full auto-reply */}
              <Button
                variant="outline"
                onClick={() =>
                  router.push(`/official/${accountId}/auto-reply`)
                }
              >
                {t("official.settings.manageAutoReply")}
              </Button>

              {/* Save */}
              <Button onClick={handleSaveAutoReply} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "..." : t("common.save")}
              </Button>
            </>
          )}

          {/* ==================== Danger Zone Tab ==================== */}
          {tab === "danger" && (
            <div className="space-y-6">
              {/* Delete account */}
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <h3 className="text-sm font-medium text-destructive">
                    {t("official.settings.deleteAccount")}
                  </h3>
                </div>
                {!deleteConfirmOpen ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="mt-3"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("official.settings.deleteAccount")}
                  </Button>
                ) : (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm text-destructive">
                      {t("official.settings.deleteConfirm")}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDelete}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t("official.settings.deleteAccount")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteConfirmOpen(false)}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
