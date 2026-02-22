"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ArrowLeft, ExternalLink, Loader2, Package } from "lucide-react";

interface AppDetail {
  id: string;
  name: string;
  description: string | null;
  category: string;
  externalUrl: string;
  iconUrl: string | null;
  status: string;
  developer?: { name: string } | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  game: "bg-purple-500/20 text-purple-400",
  strategy: "bg-blue-500/20 text-blue-400",
  social: "bg-pink-500/20 text-pink-400",
  puzzle: "bg-amber-500/20 text-amber-400",
  tool: "bg-cyan-500/20 text-cyan-400",
  other: "bg-neutral-500/20 text-neutral-400",
};

export function AppDetailPage({ appId }: { appId: string }) {
  const router = useRouter();
  const [app, setApp] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api<AppDetail>(`/api/apps/${appId}`);
        setApp(data);
      } catch {
        // handled by api()
      } finally {
        setLoading(false);
      }
    })();
  }, [appId]);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background">
        <Package className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">App not found</p>
        <Button variant="secondary" onClick={() => router.push("/apps")}>
          Back to Apps
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push("/apps")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="truncate text-lg font-semibold">{app.name}</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-8">
          {/* App hero */}
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            {app.iconUrl ? (
              <img
                src={app.iconUrl}
                alt={app.name}
                className="h-24 w-24 shrink-0 rounded-2xl object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-neutral-800">
                <Package className="h-12 w-12 text-neutral-500" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold">{app.name}</h2>
              <span
                className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  CATEGORY_COLORS[app.category.toLowerCase()] ??
                  CATEGORY_COLORS.other
                }`}
              >
                {app.category}
              </span>
              {app.developer?.name && (
                <p className="mt-2 text-sm text-muted-foreground">
                  by {app.developer.name}
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="mt-8">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              About
            </h3>
            <p className="leading-relaxed text-neutral-300">
              {app.description || "No description provided."}
            </p>
          </div>

          {/* Play button */}
          <div className="mt-8">
            <Button
              size="lg"
              className="w-full gap-2 sm:w-auto"
              onClick={() => window.open(app.externalUrl, "_blank")}
            >
              <ExternalLink className="h-4 w-4" />
              Play Now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
