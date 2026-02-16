"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Package, Loader2, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AppManifest {
  platforms?: string[];
  playersMin?: number;
  playersMax?: number;
  controlModes?: string[];
  monetizationModel?: string;
}

interface AppDetail {
  id: string;
  appId: string;
  name: string;
  description: string;
  category: string;
  icon: string | null;
  developer: string;
  manifest: AppManifest | null;
  createdAt: string;
}

interface AppDetailResponse {
  app: AppDetail;
}

function AppDetailPageContent() {
  const router = useRouter();
  const params = useParams();
  const appId = params.id as string;

  const [app, setApp] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [launched, setLaunched] = useState(false);

  useEffect(() => {
    loadApp();
  }, [appId]);

  const loadApp = async () => {
    try {
      setLoading(true);
      const data = await api<AppDetailResponse>(`/api/marketplace/apps/${appId}`);
      setApp(data.app);
    } catch (error) {
      console.error("Failed to load app:", error);
      setApp(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="min-h-dvh bg-background">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <div className="mb-6 flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/apps")}
              className="h-9 w-9"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">App Not Found</h1>
          </div>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">
              The app you're looking for could not be found.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (launched) {
    return (
      <div className="flex h-dvh flex-col bg-background">
        {/* App Runner Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 className="text-base font-semibold">{app.name}</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLaunched(false)}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Exit App
          </Button>
        </div>

        {/* App Runtime Area */}
        <div className="flex flex-1 items-center justify-center bg-neutral-800/50">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">App runtime loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-4xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/apps")}
            className="h-9 w-9"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">{app.name}</h1>
        </div>

        {/* App Info Section */}
        <div className="rounded-xl border border-border bg-card p-6 mb-6">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-neutral-800">
              <Package className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-2">{app.name}</h2>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-sm text-muted-foreground">
                  by {app.developer}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="inline-block rounded-full bg-neutral-800 px-3 py-1 text-xs text-muted-foreground">
                  {app.category}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {app.description}
              </p>
            </div>
          </div>

          {/* Manifest Info */}
          {app.manifest && (
            <div className="space-y-3 border-t border-border pt-4">
              <h3 className="text-sm font-semibold mb-3">App Details</h3>

              {app.manifest.platforms && app.manifest.platforms.length > 0 && (
                <div className="flex gap-2">
                  <span className="text-sm text-muted-foreground min-w-32">
                    Platforms:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {app.manifest.platforms.map((platform) => (
                      <span
                        key={platform}
                        className="rounded bg-neutral-800 px-2 py-0.5 text-xs"
                      >
                        {platform}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(app.manifest.playersMin !== undefined || app.manifest.playersMax !== undefined) && (
                <div className="flex gap-2">
                  <span className="text-sm text-muted-foreground min-w-32">
                    Players:
                  </span>
                  <span className="text-sm">
                    {app.manifest.playersMin ?? 1} - {app.manifest.playersMax ?? "∞"}
                  </span>
                </div>
              )}

              {app.manifest.controlModes && app.manifest.controlModes.length > 0 && (
                <div className="flex gap-2">
                  <span className="text-sm text-muted-foreground min-w-32">
                    Control Modes:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {app.manifest.controlModes.map((mode) => (
                      <span
                        key={mode}
                        className="rounded bg-neutral-800 px-2 py-0.5 text-xs"
                      >
                        {mode}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {app.manifest.monetizationModel && (
                <div className="flex gap-2">
                  <span className="text-sm text-muted-foreground min-w-32">
                    Monetization:
                  </span>
                  <span className="text-sm">{app.manifest.monetizationModel}</span>
                </div>
              )}
            </div>
          )}

          {/* Launch Button */}
          <div className="mt-6">
            <Button
              onClick={() => setLaunched(true)}
              className="w-full sm:w-auto px-8"
              size="lg"
            >
              Launch App
            </Button>
          </div>
        </div>

        {/* Additional Info */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">App ID:</span>
            <span className="font-mono text-xs">{app.appId}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Added:</span>
            <span className="text-xs">
              {new Date(app.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppDetailPage() {
  return (
    <AuthGuard>
      <AppDetailPageContent />
    </AuthGuard>
  );
}
