"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Terminal, Check, Copy, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthGuard } from "@/components/auth-guard";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";

function CliAuthContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callback");

  const [generating, setGenerating] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      // If callback URL is provided (from CLI), redirect automatically
      if (callbackUrl) {
        setRedirecting(true);
        window.location.href = `${callbackUrl}?key=${encodeURIComponent(key)}`;
      }
    } catch {
      setError("Failed to generate token. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [callbackUrl]);

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

  if (redirecting) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Redirecting to CLI...
          </p>
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
              : "Generate a token to use with the Arinova CLI."}
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
                  <p>This will create a CLI access token for your account. The token can:</p>
                  <ul className="mt-2 list-disc pl-4 space-y-1">
                    <li>Manage your agents and stickers</li>
                    <li>Access the Creator API</li>
                  </ul>
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
                {generating ? "Generating..." : "Generate CLI Token"}
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
