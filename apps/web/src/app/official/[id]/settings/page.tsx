"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2, AlertTriangle, Upload, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/lib/i18n";
import { useAccountStore } from "@/store/account-store";
import { api } from "@/lib/api";

type Tab = "general" | "danger";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

export default function OfficialSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const { updateAccount, deleteAccount } = useAccountStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const accountId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("general");

  // General
  const [isPublic, setIsPublic] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);

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
        }>(`/api/accounts/${accountId}`);
        setName(account.name ?? "");
        setBio(account.bio ?? "");
        setAvatarUrl(account.avatar ?? "");
        setIsPublic(account.isPublic ?? false);
      } catch (err) {
        console.error("Failed to load account:", err);
      } finally {
        setLoading(false);
      }
    }
    loadAccount();
  }, [accountId]);

  const handleAvatarUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${BACKEND_URL}/api/uploads`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        setAvatarUrl(data.url);
      }
    } catch (err) {
      console.error("Failed to upload avatar:", err);
    } finally {
      setUploading(false);
    }
  }, []);

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

              {/* Avatar Upload */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("common.avatar")}</label>
                <div className="flex items-center gap-4">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Avatar"
                      className="h-16 w-16 rounded-full object-cover border"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border bg-muted">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleAvatarUpload(file);
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      {uploading ? "..." : t("common.upload")}
                    </Button>
                    {avatarUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAvatarUrl("")}
                        className="text-destructive"
                      >
                        {t("common.remove")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Save */}
              <Button onClick={handleSaveGeneral} disabled={saving}>
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
