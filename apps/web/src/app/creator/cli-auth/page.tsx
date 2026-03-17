"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Terminal, Check, Copy, Loader2, ShieldCheck, Trash2, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthGuard } from "@/components/auth-guard";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

function isLocalCallback(url: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function CliAuthContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const rawCallback = searchParams.get("callback");
  const callbackUrl = isLocalCallback(rawCallback) ? rawCallback : null;

  const [generating, setGenerating] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Key list
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await api<{ keys: ApiKey[] }>("/api/creator/api-keys");
      setKeys(res.keys.filter((k) => !k.revokedAt));
    } catch {
      // ignore
    } finally {
      setKeysLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!callbackUrl) fetchKeys();
  }, [callbackUrl, fetchKeys]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await api<{ key: string }>("/api/creator/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: "CLI Login" }),
      });

      const key = res.key;
      setToken(key);

      if (callbackUrl) {
        setRedirecting(true);
        window.location.href = `${callbackUrl}?key=${encodeURIComponent(key)}`;
      } else {
        fetchKeys();
      }
    } catch {
      setError("Failed to generate token. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [callbackUrl, fetchKeys]);

  // Auto-generate if callback is present (CLI flow)
  useEffect(() => {
    if (callbackUrl && !token && !generating && !error) {
      handleGenerate();
    }
  }, [callbackUrl, token, generating, error, handleGenerate]);

  const handleCopy = useCallback(() => {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [token]);

  const handleRevoke = useCallback(
    async (id: string) => {
      setRevokingId(id);
      try {
        await api(`/api/creator/api-keys/${id}`, { method: "DELETE" });
        setKeys((prev) => prev.filter((k) => k.id !== id));
      } catch {
        // ignore
      } finally {
        setRevokingId(null);
      }
    },
    []
  );

  if (redirecting) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Redirecting to CLI...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Terminal className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">CLI Authentication</h1>
          <p className="text-sm text-muted-foreground">
            {callbackUrl
              ? "Authorize the Arinova CLI to access your account."
              : "Manage your CLI access tokens."}
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!token ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="text-sm text-muted-foreground">
                  <p>CLI tokens can manage your agents, stickers, and access the Creator API.</p>
                </div>
              </div>
            </div>

            {!callbackUrl && (
              <Button
                className="w-full"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Terminal className="mr-2 h-4 w-4" />
                )}
                {generating ? "Generating..." : "Generate New Token"}
              </Button>
            )}

            {callbackUrl && generating && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating token...
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Token generated</span>
              </div>

              {!callbackUrl && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Copy this token and paste it into your CLI:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono break-all">
                      {token}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopy}
                      className="flex-shrink-0"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Run: <code className="bg-muted px-1 rounded">arinova-cli auth set-key {"{token}"}</code>
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => setToken(null)}
                  >
                    Done
                  </Button>
                </>
              )}

              {callbackUrl && (
                <p className="text-xs text-muted-foreground">
                  If you are not redirected automatically,{" "}
                  <a
                    href={`${callbackUrl}?key=${encodeURIComponent(token)}`}
                    className="text-primary underline"
                  >
                    click here
                  </a>
                  .
                </p>
              )}
            </div>
          </div>
        )}

        {/* Key list (only in manual mode) */}
        {!callbackUrl && !token && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <Key className="h-4 w-4" />
              Active Tokens
            </h2>
            {keysLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : keys.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No active tokens. Generate one above.
              </p>
            ) : (
              <div className="space-y-2">
                {keys.map((k) => (
                  <div
                    key={k.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{k.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {k.prefix}...
                        {k.lastUsedAt
                          ? ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                          : ` · Created ${new Date(k.createdAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive flex-shrink-0"
                      onClick={() => handleRevoke(k.id)}
                      disabled={revokingId === k.id}
                    >
                      {revokingId === k.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CliAuthPage() {
  return (
    <AuthGuard>
      <Suspense
        fallback={
          <div className="flex min-h-dvh items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <CliAuthContent />
      </Suspense>
    </AuthGuard>
  );
}
