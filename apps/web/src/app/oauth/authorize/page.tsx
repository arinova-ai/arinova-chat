"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { BACKEND_URL } from "@/lib/config";
import { Loader2, Shield, Check } from "lucide-react";

function OAuthConsentContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  const clientId = searchParams.get("client_id") ?? "";
  const redirectUri = searchParams.get("redirect_uri") ?? "";
  const scope = searchParams.get("scope") ?? "profile";
  const state = searchParams.get("state");
  const appName = searchParams.get("app_name") ?? clientId;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isPending && !session) {
      const currentUrl = window.location.pathname + window.location.search;
      router.push(`/login?redirect=${encodeURIComponent(currentUrl)}`);
    }
  }, [isPending, session, router]);

  const handleApprove = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${BACKEND_URL}/oauth/authorize/consent`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope,
          state,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error_description || body.error || "Authorization failed");
      }

      const data = await res.json();
      // Redirect to the third-party app with the authorization code
      window.location.href = data.redirect_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  };

  const handleDeny = () => {
    // Redirect back with error
    const url = new URL(redirectUri);
    url.searchParams.set("error", "access_denied");
    if (state) url.searchParams.set("state", state);
    window.location.href = url.toString();
  };

  if (isPending || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const scopes = scope.split(/[\s+]/).filter(Boolean);

  const scopeLabels: Record<string, string> = {
    profile: "Access your profile information",
    agents: "Access your AI agents",
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/20">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[oklch(0.25_0.05_250)]">
            <Shield className="h-7 w-7 text-[oklch(0.65_0.15_250)]" />
          </div>
          <h1 className="text-2xl font-bold">Authorize {appName}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{appName}</span> wants
            to access your Arinova account.
          </p>
        </div>

        {/* User info */}
        <div className="rounded-lg border border-border bg-background/50 px-4 py-3">
          <p className="text-sm text-muted-foreground">Signed in as</p>
          <p className="font-medium">
            {(session.user as Record<string, unknown>).name as string}{" "}
            <span className="text-muted-foreground">
              ({(session.user as Record<string, unknown>).email as string})
            </span>
          </p>
        </div>

        {/* Permissions */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            This will allow {appName} to:
          </p>
          <ul className="space-y-2">
            {scopes.map((s) => (
              <li key={s} className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-emerald-400" />
                {scopeLabels[s] ?? s}
              </li>
            ))}
          </ul>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleDeny}
            disabled={loading}
            className="flex h-11 flex-1 items-center justify-center rounded-lg border border-border bg-background text-sm font-medium transition-colors hover:bg-accent"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={loading}
            className="brand-gradient-btn flex h-11 flex-1 items-center justify-center rounded-lg text-sm"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Authorize
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground/60">
          You can revoke this access at any time from your account settings.
        </p>
      </div>
    </div>
  );
}

export default function OAuthAuthorizePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <OAuthConsentContent />
    </Suspense>
  );
}
