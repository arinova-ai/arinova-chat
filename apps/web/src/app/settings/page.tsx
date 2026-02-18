"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Loader2, User, Lock, LogOut, Bell, BellOff, Moon, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { getPushStatus, subscribeToPush, unsubscribeFromPush } from "@/lib/push";

interface NotificationPrefs {
  globalEnabled: boolean;
  messageEnabled: boolean;
  playgroundInviteEnabled: boolean;
  playgroundTurnEnabled: boolean;
  playgroundResultEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

const DEFAULT_PREFS: NotificationPrefs = {
  globalEnabled: true,
  messageEnabled: true,
  playgroundInviteEnabled: true,
  playgroundTurnEnabled: true,
  playgroundResultEnabled: true,
  quietHoursStart: null,
  quietHoursEnd: null,
};

function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    setSaving(true);
    try {
      await api("/api/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify(updated),
      });
    } catch {
      // Revert on error handled by toast
    } finally {
      setSaving(false);
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
      <div className="mb-8 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Notifications</h2>
        </div>
        <div className="mt-4 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const quietHoursEnabled = prefs.quietHoursStart !== null && prefs.quietHoursEnd !== null;

  return (
    <div className="mb-8 rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Bell className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Notifications</h2>
      </div>

      <div className="space-y-4">
        {/* Push subscription toggle */}
        {pushStatus.supported && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Push Notifications</p>
              <p className="text-xs text-muted-foreground">
                {pushStatus.permission === "denied"
                  ? "Blocked by browser — update in browser settings"
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
        )}

        <Separator />

        {/* Global toggle */}
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

        {/* Per-type toggles (disabled when global is off) */}
        <div className={prefs.globalEnabled ? "" : "pointer-events-none opacity-50"}>
          <div className="space-y-3 pl-2">
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
                <p className="text-sm">Playground Invites</p>
                <p className="text-xs text-muted-foreground">When someone joins your session</p>
              </div>
              <Switch
                checked={prefs.playgroundInviteEnabled}
                onCheckedChange={handleToggle("playgroundInviteEnabled")}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Turn Notifications</p>
                <p className="text-xs text-muted-foreground">When a playground phase changes</p>
              </div>
              <Switch
                checked={prefs.playgroundTurnEnabled}
                onCheckedChange={handleToggle("playgroundTurnEnabled")}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Session Results</p>
                <p className="text-xs text-muted-foreground">When a playground session finishes</p>
              </div>
              <Switch
                checked={prefs.playgroundResultEnabled}
                onCheckedChange={handleToggle("playgroundResultEnabled")}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Quiet hours */}
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
                className="h-8 w-28 bg-neutral-800 border-none text-sm"
              />
            </div>
            <span className="mt-4 text-muted-foreground">—</span>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">To</label>
              <Input
                type="time"
                value={prefs.quietHoursEnd ?? "08:00"}
                onChange={(e) =>
                  savePrefs({ ...prefs, quietHoursEnd: e.target.value })
                }
                className="h-8 w-28 bg-neutral-800 border-none text-sm"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsContent() {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  // Update name state
  const [name, setName] = useState(session?.user?.name ?? "");
  const [nameLoading, setNameLoading] = useState(false);
  const [nameSuccess, setNameSuccess] = useState("");
  const [nameError, setNameError] = useState("");

  // Change password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Sign out state
  const [signingOut, setSigningOut] = useState(false);

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
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
      });
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

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
      router.push("/login");
    } catch {
      setSigningOut(false);
    }
  };

  return (
    <div className="app-dvh overflow-y-auto bg-background">
      <div className="mx-auto max-w-lg px-4 pb-[max(2rem,env(safe-area-inset-bottom,2rem))] pt-[max(1.25rem,env(safe-area-inset-top,1.25rem))]">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>

        {/* User info */}
        <div className="mb-8 rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white">
              <User className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium">{session?.user?.name}</p>
              <p className="text-sm text-muted-foreground">
                {session?.user?.email}
              </p>
            </div>
          </div>
        </div>

        {/* Update name */}
        <div className="mb-8 rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Update Name</h2>
          </div>

          <form onSubmit={handleUpdateName} className="space-y-4">
            {nameError && (
              <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {nameError}
              </div>
            )}
            {nameSuccess && (
              <div className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">
                {nameSuccess}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Display Name
              </label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
                className="bg-neutral-800 border-none"
              />
            </div>

            <Button type="submit" disabled={nameLoading}>
              {nameLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Update Name
            </Button>
          </form>
        </div>

        {/* Change password */}
        <div className="mb-8 rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Change Password</h2>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            {passwordError && (
              <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">
                {passwordSuccess}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="currentPassword" className="text-sm font-medium">
                Current Password
              </label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="********"
                required
                className="bg-neutral-800 border-none"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="newPassword" className="text-sm font-medium">
                New Password
              </label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
                className="bg-neutral-800 border-none"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm New Password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                required
                minLength={8}
                className="bg-neutral-800 border-none"
              />
            </div>

            <Button type="submit" disabled={passwordLoading}>
              {passwordLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Change Password
            </Button>
          </form>
        </div>

        {/* Notifications */}
        <NotificationSettings />

        <Separator className="my-8" />

        {/* Sign out */}
        <Button
          variant="destructive"
          className="w-full gap-2"
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
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsContent />
    </AuthGuard>
  );
}
