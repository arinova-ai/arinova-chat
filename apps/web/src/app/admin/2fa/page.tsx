"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Shield } from "lucide-react";

interface Policy { enforced: boolean; enrolledUsers: number; totalUsers: number }

export default function Admin2FAPage() {
  const [data, setData] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Policy>("/api/admin/2fa-policy").then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleToggle = async (enforced: boolean) => {
    setSaving(true);
    try {
      await api("/api/admin/2fa-policy", { method: "POST", body: JSON.stringify({ enforced }) });
      setData((d) => d ? { ...d, enforced } : d);
    } catch {} finally { setSaving(false); }
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="p-6 space-y-6 max-w-lg">
      <h2 className="text-xl font-bold">Two-Factor Authentication</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Enrolled Users</p>
          <p className="text-2xl font-bold">{data?.enrolledUsers ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Users</p>
          <p className="text-2xl font-bold">{data?.totalUsers ?? 0}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-medium">Enforce 2FA for all users</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          When enabled, users must set up Google Authenticator (TOTP) before they can access the platform.
          Users without 2FA will be redirected to a setup page on login.
        </p>
        <div className="flex items-center gap-3">
          <Switch
            checked={data?.enforced ?? false}
            onCheckedChange={handleToggle}
            disabled={saving}
          />
          <span className="text-sm">{data?.enforced ? "Enforced" : "Not enforced"}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="font-medium mb-2">Enrollment Rate</h3>
        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-brand rounded-full transition-all"
            style={{ width: `${data && data.totalUsers > 0 ? (data.enrolledUsers / data.totalUsers) * 100 : 0}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {data && data.totalUsers > 0 ? Math.round((data.enrolledUsers / data.totalUsers) * 100) : 0}% of users have 2FA enabled
        </p>
      </div>
    </div>
  );
}
