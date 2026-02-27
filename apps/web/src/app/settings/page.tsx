"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
} from "lucide-react";
import { api } from "@/lib/api";
import { assetUrl } from "@/lib/config";
import { getPushStatus, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { useChatStore } from "@/store/chat-store";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { cn } from "@/lib/utils";

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

const NAV_ITEMS: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
  { id: "profile", label: "Profile", icon: <User className="h-4 w-4" /> },
  { id: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" /> },
  { id: "notifications", label: "Notifications", icon: <Bell className="h-4 w-4" /> },
  { id: "privacy", label: "Privacy", icon: <ShieldBan className="h-4 w-4" /> },
];

// ───── Profile Panel ─────

function ProfilePanel() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [name, setName] = useState(session?.user?.name ?? "");
  const [nameLoading, setNameLoading] = useState(false);
  const [nameSuccess, setNameSuccess] = useState("");
  const [nameError, setNameError] = useState("");

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
      setNameError("Name cannot be empty");
      return;
    }
    setNameLoading(true);
    try {
      const result = await authClient.updateUser({ name: trimmed });
      if (result.error) {
        setNameError(result.error.message ?? "Failed to update name");
      } else {
        setNameSuccess("Name updated successfully");
        setTimeout(() => setNameSuccess(""), 3000);
      }
    } catch {
      setNameError("An unexpected error occurred");
    } finally {
      setNameLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    setPasswordLoading(true);
    try {
      const result = await authClient.changePassword({ currentPassword, newPassword });
      if (result.error) {
        setPasswordError(result.error.message ?? "Failed to change password");
      } else {
        setPasswordSuccess("Password changed successfully");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setPasswordSuccess(""), 3000);
      }
    } catch {
      setPasswordError("An unexpected error occurred");
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Profile</h2>
        <p className="text-sm text-muted-foreground">Manage your personal information and preferences.</p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-6">
        <div className="relative group">
          <Avatar className="h-24 w-24 border-2 border-[oklch(0.55_0.2_250/30%)]">
            {session?.user?.image ? (
              <AvatarImage src={assetUrl(session.user.image)} alt={session?.user?.name ?? ""} />
            ) : null}
            <AvatarFallback className="bg-secondary text-2xl">
              {sessionPending ? "" : (session?.user?.name ?? "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer">
            <Camera className="h-6 w-6 text-white" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Change Avatar</p>
      </div>

      {/* Profile form */}
      <form onSubmit={handleUpdateName} className="space-y-6">
        {nameError && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{nameError}</div>
        )}
        {nameSuccess && (
          <div className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">{nameSuccess}</div>
        )}

        <div className="space-y-2">
          <label htmlFor="displayName" className="text-sm font-medium">Display Name</label>
          <Input
            id="displayName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your display name"
            required
            className="bg-secondary border-border"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <Input
            value={session?.user?.email ?? ""}
            readOnly
            className="bg-secondary border-border text-muted-foreground"
            placeholder="user@example.com"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Bio</label>
          <textarea
            placeholder="Tell us a little about yourself..."
            className="min-h-[100px] w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>

        <Button type="submit" className="brand-gradient-btn w-full" disabled={nameLoading}>
          {nameLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </form>

      <Separator />

      {/* Change Password */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Change Password</h3>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4">
          {passwordError && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{passwordError}</div>
          )}
          {passwordSuccess && (
            <div className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">{passwordSuccess}</div>
          )}

          <div className="space-y-2">
            <label htmlFor="currentPassword" className="text-sm font-medium">Current Password</label>
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
            <label htmlFor="newPassword" className="text-sm font-medium">New Password</label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              className="bg-secondary border-border"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">Confirm New Password</label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              required
              minLength={8}
              className="bg-secondary border-border"
            />
          </div>

          <Button type="submit" variant="secondary" disabled={passwordLoading}>
            {passwordLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Change Password
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

function AppearancePanel() {
  const [quality, setQuality] = useState<"high" | "performance">(readThemeQuality);

  const handleQualityChange = (value: "high" | "performance") => {
    setQuality(value);
    localStorage.setItem(THEME_QUALITY_KEY, value);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Appearance</h2>
        <p className="text-sm text-muted-foreground">Customize the look and feel of the app.</p>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">Theme</label>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Light</span>
            <Switch checked={true} />
            <span className="text-sm">Dark</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Theme Quality</label>
          <p className="text-xs text-muted-foreground">
            Choose rendering quality for virtual office themes. Lower quality improves performance on older devices.
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
                <div className="text-sm font-medium">High Resolution</div>
                <div className="text-xs text-muted-foreground">Full textures & lighting</div>
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
                <div className="text-sm font-medium">Performance</div>
                <div className="text-xs text-muted-foreground">Reduced quality, faster</div>
              </div>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Language</label>
          <select className="h-9 w-full rounded-md border border-border bg-secondary px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
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
          <h2 className="text-2xl font-bold">Notifications</h2>
          <p className="text-sm text-muted-foreground">Manage how you receive notifications.</p>
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
        <h2 className="text-2xl font-bold">Notifications</h2>
        <p className="text-sm text-muted-foreground">Manage how you receive notifications.</p>
      </div>

      <div className="space-y-5">
        {pushStatus.supported && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Push Notifications</p>
                <p className="text-xs text-muted-foreground">
                  {pushStatus.permission === "denied"
                    ? "Blocked by browser \u2014 update in browser settings"
                    : pushStatus.subscribed
                      ? "Enabled on this device"
                      : "Receive notifications on this device"}
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
                  "Disable"
                ) : (
                  "Enable"
                )}
              </Button>
            </div>
            <Separator />
          </>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">All Notifications</p>
            <p className="text-xs text-muted-foreground">Master switch for all notification types</p>
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
                <p className="text-sm">Messages</p>
                <p className="text-xs text-muted-foreground">Agent replies in conversations</p>
              </div>
              <Switch
                checked={prefs.messageEnabled}
                onCheckedChange={handleToggle("messageEnabled")}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">App Activity</p>
                <p className="text-xs text-muted-foreground">Updates from apps you use</p>
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
              <p className="text-sm font-medium">Quiet Hours</p>
              <p className="text-xs text-muted-foreground">Pause notifications during set hours</p>
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
              <label className="text-xs text-muted-foreground">From</label>
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
              <label className="text-xs text-muted-foreground">To</label>
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
        <h2 className="text-2xl font-bold">Privacy</h2>
        <p className="text-sm text-muted-foreground">Manage blocked users and privacy settings.</p>
      </div>

      <div>
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <ShieldBan className="h-5 w-5 text-muted-foreground" />
          Blocked Users
        </h3>

        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : blockedUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No blocked users</p>
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
                    "Unblock"
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
          <h1 className="text-lg font-bold">Settings</h1>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                activeSection === item.id
                  ? "bg-[oklch(0.55_0.2_250/15%)] text-[oklch(0.7_0.18_250)]"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
              {activeSection === item.id && <ChevronRight className="h-4 w-4" />}
            </button>
          ))}
        </nav>

        <div className="p-3">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-red-400 hover:bg-red-950/30 hover:text-red-300"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            Sign Out
          </Button>
        </div>
      </div>

      {/* Content panel */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile header */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 md:hidden">
          <h1 className="text-lg font-bold">Settings</h1>
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
                  ? "bg-[oklch(0.55_0.2_250)] text-white"
                  : "bg-secondary text-muted-foreground"
              )}
            >
              {item.icon}
              {item.label}
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
            Sign Out
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
