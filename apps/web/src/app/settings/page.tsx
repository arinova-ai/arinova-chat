"use client";

import { useState, useEffect, useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Loader2,
  User,
  Lock,
  LogOut,
  Bell,
  Clock,
  ShieldBan,
  Camera,
  Palette,
  ChevronRight,
  Monitor,
  Zap,
  ZoomIn,
  ZoomOut,
  Settings,
} from "lucide-react";
import { PageTitle } from "@/components/ui/page-title";
import { api } from "@/lib/api";
import { assetUrl, BACKEND_URL } from "@/lib/config";
import { getPushStatus, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { useChatStore } from "@/store/chat-store";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { cn } from "@/lib/utils";
import { useTranslation, type Locale } from "@/lib/i18n";

// ───── Types ─────

type SettingsSection = "profile" | "appearance" | "notifications" | "privacy";

interface NotificationPrefs {
  globalEnabled: boolean;
  messageEnabled: boolean;
  appActivityEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

const DEFAULT_PREFS: NotificationPrefs = {
  globalEnabled: true,
  messageEnabled: true,
  appActivityEnabled: true,
  quietHoursStart: null,
  quietHoursEnd: null,
};

interface BlockedUser {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
}

// ───── Sidebar Nav Items ─────

const NAV_ITEMS: { id: SettingsSection; labelKey: string; icon: React.ReactNode }[] = [
  { id: "profile", labelKey: "settings.nav.profile", icon: <User className="h-4 w-4" /> },
  { id: "appearance", labelKey: "settings.nav.appearance", icon: <Palette className="h-4 w-4" /> },
  { id: "notifications", labelKey: "settings.nav.notifications", icon: <Bell className="h-4 w-4" /> },
  { id: "privacy", labelKey: "settings.nav.privacy", icon: <ShieldBan className="h-4 w-4" /> },
];

// ───── Avatar Crop Dialog ─────

const CROP_SIZE = 512;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

function cropImageToBlob(
  img: HTMLImageElement,
  offsetX: number,
  offsetY: number,
  scale: number,
  viewSize: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = CROP_SIZE;
    canvas.height = CROP_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("Canvas not supported"));

    // Map viewport coords to source image coords
    const ratio = CROP_SIZE / viewSize;
    const dx = offsetX * ratio;
    const dy = offsetY * ratio;
    const scaledW = img.naturalWidth * scale * ratio;
    const scaledH = img.naturalHeight * scale * ratio;

    ctx.drawImage(img, dx, dy, scaledW, scaledH);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
      "image/png",
    );
  });
}

function AvatarCropDialog({
  file,
  onConfirm,
  onCancel,
}: {
  file: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const viewSize = 280;

  // Load image
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      // Center the image — fit shorter dimension to viewSize
      const fitScale = viewSize / Math.min(img.naturalWidth, img.naturalHeight);
      setScale(fitScale);
      setOffset({
        x: (viewSize - img.naturalWidth * fitScale) / 2,
        y: (viewSize - img.naturalHeight * fitScale) / 2,
      });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handlePointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    if (!dragging) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  };

  const handlePointerUp = () => setDragging(false);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s - e.deltaY * 0.002)));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const adjustScale = (delta: number) => {
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s + delta)));
  };

  const handleConfirm = async () => {
    const img = imgRef.current;
    if (!img) return;
    try {
      const blob = await cropImageToBlob(img, offset.x, offset.y, scale, viewSize);
      onConfirm(blob);
    } catch {
      onCancel();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{t("settings.profile.cropAvatar")}</DialogTitle>

        {/* Crop area */}
        <div className="flex flex-col items-center gap-4">
          <div
            ref={containerRef}
            className="relative overflow-hidden rounded-full border-2 border-border cursor-grab active:cursor-grabbing select-none touch-none"
            style={{ width: viewSize, height: viewSize }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {imgSrc && (
              <img
                src={imgSrc}
                alt=""
                draggable={false}
                className="pointer-events-none absolute"
                style={{
                  left: offset.x,
                  top: offset.y,
                  width: imgRef.current ? imgRef.current.naturalWidth * scale : "auto",
                  height: imgRef.current ? imgRef.current.naturalHeight * scale : "auto",
                  maxWidth: "none",
                }}
              />
            )}
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => adjustScale(-0.15)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={0.01}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-32 accent-brand"
            />
            <button
              type="button"
              onClick={() => adjustScale(0.15)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button className="brand-gradient-btn" onClick={handleConfirm}>
            {t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───── Profile Panel ─────

function ProfilePanel() {
  const { t } = useTranslation();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [name, setName] = useState(session?.user?.name ?? "");
  const [nameLoading, setNameLoading] = useState(false);
  const [nameSuccess, setNameSuccess] = useState("");
  const [nameError, setNameError] = useState("");

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    if (session?.user?.name) setName(session.user.name);
  }, [session?.user?.name]);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError("");
    setNameSuccess("");
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t("settings.profile.nameEmpty"));
      return;
    }
    setNameLoading(true);
    try {
      const result = await authClient.updateUser({ name: trimmed });
      if (result.error) {
        setNameError(result.error.message ?? t("settings.profile.nameUpdateFailed"));
      } else {
        setNameSuccess(t("settings.profile.nameUpdated"));
        setTimeout(() => setNameSuccess(""), 3000);
      }
    } catch {
      setNameError(t("settings.profile.unexpectedError"));
    } finally {
      setNameLoading(false);
    }
  };

  const handleAvatarUpload = async (blob: Blob) => {
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", blob, "avatar.png");
      const res = await fetch(`${BACKEND_URL}/api/auth/upload-avatar`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Upload failed");
      }
      const data = await res.json();
      await authClient.updateUser({ image: data.imageUrl });
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Avatar upload failed");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    if (newPassword.length < 8) {
      setPasswordError(t("settings.profile.passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t("settings.profile.passwordMismatch"));
      return;
    }
    setPasswordLoading(true);
    try {
      const result = await authClient.changePassword({ currentPassword, newPassword });
      if (result.error) {
        setPasswordError(result.error.message ?? t("settings.profile.passwordChangeFailed"));
      } else {
        setPasswordSuccess(t("settings.profile.passwordChanged"));
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setPasswordSuccess(""), 3000);
      }
    } catch {
      setPasswordError(t("settings.profile.unexpectedError"));
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">{t("settings.profile.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("settings.profile.subtitle")}</p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-6">
        <button
          type="button"
          className="relative group"
          onClick={() => avatarInputRef.current?.click()}
          disabled={avatarUploading}
        >
          <Avatar className="h-24 w-24 border-2 border-[oklch(0.55_0.2_250/30%)]">
            {session?.user?.image ? (
              <AvatarImage src={assetUrl(session.user.image)} alt={session?.user?.name ?? ""} />
            ) : null}
            <AvatarFallback className="bg-secondary text-2xl">
              {sessionPending ? "" : (session?.user?.name ?? "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer">
            {avatarUploading ? (
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            ) : (
              <Camera className="h-6 w-6 text-white" />
            )}
          </div>
        </button>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              if (!file.type.startsWith("image/")) return;
              if (file.size > 5 * 1024 * 1024) {
                setNameError(t("settings.profile.avatarTooLarge"));
                return;
              }
              setCropFile(file);
            }
            e.target.value = "";
          }}
        />
        <p className="text-sm text-muted-foreground">{t("settings.profile.changeAvatar")}</p>
      </div>

      {/* Avatar crop dialog */}
      {cropFile && (
        <AvatarCropDialog
          file={cropFile}
          onConfirm={(blob) => {
            setCropFile(null);
            handleAvatarUpload(blob);
          }}
          onCancel={() => setCropFile(null)}
        />
      )}

      {/* Profile form */}
      <form onSubmit={handleUpdateName} className="space-y-6">
        {nameError && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{nameError}</div>
        )}
        {nameSuccess && (
          <div className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">{nameSuccess}</div>
        )}

        <div className="space-y-2">
          <label htmlFor="displayName" className="text-sm font-medium">{t("settings.profile.displayName")}</label>
          <Input
            id="displayName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("settings.profile.displayNamePlaceholder")}
            required
            className="bg-secondary border-border"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t("settings.profile.username")}</label>
          <Input
            value={(session?.user as Record<string, unknown> | undefined)?.username ? `@${(session?.user as Record<string, unknown>).username}` : ""}
            readOnly
            className="bg-secondary border-border text-muted-foreground"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t("settings.profile.email")}</label>
          <Input
            value={session?.user?.email ?? ""}
            readOnly
            className="bg-secondary border-border text-muted-foreground"
            placeholder="user@example.com"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t("settings.profile.bio")}</label>
          <textarea
            placeholder={t("settings.profile.bioPlaceholder")}
            className="min-h-[100px] w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>

        <Button type="submit" className="brand-gradient-btn w-full" disabled={nameLoading}>
          {nameLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("common.save")}
        </Button>
      </form>

      <Separator />

      {/* Change Password */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{t("settings.profile.changePassword")}</h3>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4">
          {passwordError && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{passwordError}</div>
          )}
          {passwordSuccess && (
            <div className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">{passwordSuccess}</div>
          )}

          <div className="space-y-2">
            <label htmlFor="currentPassword" className="text-sm font-medium">{t("settings.profile.currentPassword")}</label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="********"
              required
              className="bg-secondary border-border"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="newPassword" className="text-sm font-medium">{t("settings.profile.newPassword")}</label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("settings.profile.newPasswordPlaceholder")}
              required
              minLength={8}
              className="bg-secondary border-border"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">{t("settings.profile.confirmPassword")}</label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t("settings.profile.confirmPasswordPlaceholder")}
              required
              minLength={8}
              className="bg-secondary border-border"
            />
          </div>

          <Button type="submit" variant="secondary" disabled={passwordLoading}>
            {passwordLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("settings.profile.changePassword")}
          </Button>
        </form>
      </div>
    </div>
  );
}

// ───── Appearance Panel ─────

const THEME_QUALITY_KEY = "arinova_theme_quality";

function readThemeQuality(): "high" | "performance" {
  if (typeof window === "undefined") return "high";
  const saved = localStorage.getItem(THEME_QUALITY_KEY);
  return saved === "performance" ? "performance" : "high";
}

function useCurrentThemeRenderer(): string | null {
  const [renderer, setRenderer] = useState<string | null>(null);
  useEffect(() => {
    const themeId = localStorage.getItem("arinova-office-theme") ?? "cozy-studio";
    fetch(`/themes/${themeId}/theme.json`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.renderer) setRenderer(data.renderer); })
      .catch(() => {});
  }, []);
  return renderer;
}

function AppearancePanel() {
  const { t, locale, setLocale } = useTranslation();
  const [quality, setQuality] = useState<"high" | "performance">(readThemeQuality);
  const themeRenderer = useCurrentThemeRenderer();

  const handleQualityChange = (value: "high" | "performance") => {
    setQuality(value);
    localStorage.setItem(THEME_QUALITY_KEY, value);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">{t("settings.appearance.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("settings.appearance.subtitle")}</p>
      </div>

      <div className="space-y-6">
        {themeRenderer === "threejs" && (
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("settings.appearance.quality")}</label>
            <p className="text-xs text-muted-foreground">
              {t("settings.appearance.qualityDesc")}
            </p>
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => handleQualityChange("high")}
                className={cn(
                  "flex flex-1 items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  quality === "high"
                    ? "border-brand bg-brand/10 text-foreground"
                    : "border-border bg-secondary text-muted-foreground hover:bg-secondary/80",
                )}
              >
                <Monitor className="h-5 w-5 shrink-0" />
                <div>
                  <div className="text-sm font-medium">{t("settings.appearance.highRes")}</div>
                  <div className="text-xs text-muted-foreground">{t("settings.appearance.highResDesc")}</div>
                </div>
              </button>
              <button
                onClick={() => handleQualityChange("performance")}
                className={cn(
                  "flex flex-1 items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  quality === "performance"
                    ? "border-brand bg-brand/10 text-foreground"
                    : "border-border bg-secondary text-muted-foreground hover:bg-secondary/80",
                )}
              >
                <Zap className="h-5 w-5 shrink-0" />
                <div>
                  <div className="text-sm font-medium">{t("settings.appearance.performance")}</div>
                  <div className="text-xs text-muted-foreground">{t("settings.appearance.performanceDesc")}</div>
                </div>
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium">{t("settings.appearance.language")}</label>
          <select
            className="h-9 w-full rounded-md border border-border bg-secondary px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
          >
            <option value="en">English</option>
            <option value="zh-TW">繁體中文</option>
            <option value="zh-CN">简体中文</option>
            <option value="ja">日本語</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// ───── Notification Panel ─────

function NotificationPanel() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [pushStatus, setPushStatus] = useState<{
    supported: boolean;
    permission: NotificationPermission | null;
    subscribed: boolean;
  }>({ supported: false, permission: null, subscribed: false });
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [prefsData, status] = await Promise.all([
          api<NotificationPrefs>("/api/notifications/preferences", { silent: true }),
          getPushStatus(),
        ]);
        setPrefs(prefsData);
        setPushStatus(status);
      } catch {
        // Use defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const savePrefs = useCallback(async (updated: NotificationPrefs) => {
    setPrefs(updated);
    try {
      await api("/api/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify(updated),
      });
    } catch {
      // Revert handled by toast
    }
  }, []);

  const handleToggle = (key: keyof NotificationPrefs) => (checked: boolean) => {
    savePrefs({ ...prefs, [key]: checked });
  };

  const handlePushToggle = async () => {
    setPushLoading(true);
    try {
      if (pushStatus.subscribed) {
        await unsubscribeFromPush();
        setPushStatus((s) => ({ ...s, subscribed: false, permission: "default" }));
      } else {
        const success = await subscribeToPush();
        if (success) {
          setPushStatus((s) => ({ ...s, subscribed: true, permission: "granted" }));
        }
      }
    } finally {
      setPushLoading(false);
    }
  };

  const handleQuietHoursToggle = (enabled: boolean) => {
    if (enabled) {
      savePrefs({ ...prefs, quietHoursStart: "22:00", quietHoursEnd: "08:00" });
    } else {
      savePrefs({ ...prefs, quietHoursStart: null, quietHoursEnd: null });
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold">{t("settings.notifications.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("settings.notifications.subtitle")}</p>
        </div>
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const quietHoursEnabled = prefs.quietHoursStart !== null && prefs.quietHoursEnd !== null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">{t("settings.notifications.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("settings.notifications.subtitle")}</p>
      </div>

      <div className="space-y-5">
        {pushStatus.supported && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t("settings.notifications.push")}</p>
                <p className="text-xs text-muted-foreground">
                  {pushStatus.permission === "denied"
                    ? t("settings.notifications.pushBlocked")
                    : pushStatus.subscribed
                      ? t("settings.notifications.pushEnabled")
                      : t("settings.notifications.pushReceive")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePushToggle}
                disabled={pushLoading || pushStatus.permission === "denied"}
              >
                {pushLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : pushStatus.subscribed ? (
                  t("common.disable")
                ) : (
                  t("common.enable")
                )}
              </Button>
            </div>
            <Separator />
          </>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t("settings.notifications.all")}</p>
            <p className="text-xs text-muted-foreground">{t("settings.notifications.allDesc")}</p>
          </div>
          <Switch
            checked={prefs.globalEnabled}
            onCheckedChange={handleToggle("globalEnabled")}
          />
        </div>

        <div className={prefs.globalEnabled ? "" : "pointer-events-none opacity-50"}>
          <div className="space-y-4 pl-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">{t("settings.notifications.messages")}</p>
                <p className="text-xs text-muted-foreground">{t("settings.notifications.messagesDesc")}</p>
              </div>
              <Switch
                checked={prefs.messageEnabled}
                onCheckedChange={handleToggle("messageEnabled")}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">{t("settings.notifications.appActivity")}</p>
                <p className="text-xs text-muted-foreground">{t("settings.notifications.appActivityDesc")}</p>
              </div>
              <Switch
                checked={prefs.appActivityEnabled}
                onCheckedChange={handleToggle("appActivityEnabled")}
              />
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{t("settings.notifications.quietHours")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.notifications.quietHoursDesc")}</p>
            </div>
          </div>
          <Switch
            checked={quietHoursEnabled}
            onCheckedChange={handleQuietHoursToggle}
          />
        </div>

        {quietHoursEnabled && (
          <div className="flex items-center gap-3 pl-8">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("settings.notifications.from")}</label>
              <Input
                type="time"
                value={prefs.quietHoursStart ?? "22:00"}
                onChange={(e) =>
                  savePrefs({ ...prefs, quietHoursStart: e.target.value })
                }
                className="h-8 w-28 bg-secondary border-border text-sm"
              />
            </div>
            <span className="mt-4 text-muted-foreground">&mdash;</span>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("settings.notifications.to")}</label>
              <Input
                type="time"
                value={prefs.quietHoursEnd ?? "08:00"}
                onChange={(e) =>
                  savePrefs({ ...prefs, quietHoursEnd: e.target.value })
                }
                className="h-8 w-28 bg-secondary border-border text-sm"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ───── Privacy Panel ─────

function PrivacyPanel() {
  const { t } = useTranslation();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const unblockUser = useChatStore((s) => s.unblockUser);

  useEffect(() => {
    (async () => {
      try {
        const data = await api<BlockedUser[]>("/api/users/blocked");
        setBlockedUsers(data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleUnblock = async (userId: string) => {
    setUnblockingId(userId);
    try {
      await unblockUser(userId);
      setBlockedUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch {
      // ignore
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">{t("settings.privacy.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("settings.privacy.subtitle")}</p>
      </div>

      <div>
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <ShieldBan className="h-5 w-5 text-muted-foreground" />
          {t("settings.privacy.blockedUsers")}
        </h3>

        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : blockedUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("settings.privacy.noBlocked")}</p>
        ) : (
          <div className="space-y-2">
            {blockedUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent/50 transition-colors"
              >
                <Avatar className="h-8 w-8 shrink-0">
                  {user.image ? (
                    <AvatarImage src={assetUrl(user.image)} alt={user.username ?? user.name ?? ""} />
                  ) : null}
                  <AvatarFallback className="text-xs bg-secondary">
                    {(user.name ?? user.username ?? "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{user.name ?? user.username ?? "Unknown"}</p>
                  {user.username && (
                    <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUnblock(user.id)}
                  disabled={unblockingId === user.id}
                >
                  {unblockingId === user.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    t("common.unblock")
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───── Settings Layout ─────

function SettingsContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
      router.push("/login");
    } catch {
      setSigningOut(false);
    }
  };

  const renderPanel = () => {
    switch (activeSection) {
      case "profile": return <ProfilePanel />;
      case "appearance": return <AppearancePanel />;
      case "notifications": return <NotificationPanel />;
      case "privacy": return <PrivacyPanel />;
    }
  };

  return (
    <div className="app-dvh flex bg-background">
      {/* Desktop Icon Rail */}
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      {/* Settings Sidebar — desktop */}
      <div className="hidden h-full w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="p-5">
          <PageTitle title={t("settings.title")} subtitle={t("settings.subtitle")} icon={Settings} />
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                activeSection === item.id
                  ? "bg-brand/15 text-brand-text"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              {item.icon}
              <span className="flex-1 text-left">{t(item.labelKey)}</span>
              {activeSection === item.id && <ChevronRight className="h-4 w-4" />}
            </button>
          ))}
        </nav>

        <div className="p-3">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            {t("common.signOut")}
          </Button>
        </div>
      </div>

      {/* Content panel */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile header */}
        <div className="border-b border-border px-4 py-3 md:hidden">
          <PageTitle title={t("settings.title")} subtitle={t("settings.subtitle")} icon={Settings} />
        </div>

        {/* Mobile nav tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                activeSection === item.id
                  ? "bg-brand text-white"
                  : "bg-secondary text-muted-foreground"
              )}
            >
              {item.icon}
              {t(item.labelKey)}
            </button>
          ))}
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="mx-auto max-w-xl">
            {renderPanel()}
          </div>
        </div>

        {/* Mobile sign out */}
        <div className="border-t border-border p-4 md:hidden">
          <Button
            variant="ghost"
            className="w-full justify-center gap-2 text-red-400 hover:bg-red-950/30 hover:text-red-300"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            {t("common.signOut")}
          </Button>
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsContent />
    </AuthGuard>
  );
}
