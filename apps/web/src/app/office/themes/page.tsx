"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Palette, Check, Lock, Users } from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { ThemeProvider, useTheme } from "@/components/office/theme-context";
import { THEME_REGISTRY, type ThemeEntry } from "@/components/office/theme-registry";

function ThemeCard({ entry }: { entry: ThemeEntry }) {
  const { themeId, switchTheme } = useTheme();
  const [toast, setToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActive = themeId === entry.id;
  const isFree = entry.price === "free";
  const isPremium = !isFree;

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  const handleApply = () => {
    if (!isFree || isActive) return;
    switchTheme(entry.id);
    setToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), 2000);
  };

  return (
    <div className="group relative rounded-xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-lg hover:shadow-brand/5">
      {/* Preview image */}
      <div className="relative aspect-video overflow-hidden">
        <Image
          src={entry.previewUrl}
          alt={entry.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, 50vw"
        />
        {isPremium && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-bold tracking-wider text-amber-400 uppercase">
              Premium
            </span>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-4 space-y-3">
        {/* Name + price */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-foreground truncate">{entry.name}</h3>
          {isFree ? (
            <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
              FREE
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
              {entry.price} Credits
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2">{entry.description}</p>

        {/* Meta: agents + tags */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {entry.maxAgents} {entry.maxAgents === 1 ? "agent" : "agents"}
          </span>
          <span className="text-muted-foreground/40">|</span>
          <span className="truncate">
            {entry.tags.map((t) => `#${t}`).join(" ")}
          </span>
        </div>

        {/* Action button */}
        {isActive ? (
          <button
            disabled
            className="w-full rounded-lg bg-emerald-500/15 py-2 text-sm font-medium text-emerald-400 flex items-center justify-center gap-1.5"
          >
            <Check className="h-4 w-4" />
            Applied
          </button>
        ) : isFree ? (
          <button
            onClick={handleApply}
            className="w-full rounded-lg bg-brand py-2 text-sm font-medium text-brand-text transition-colors hover:bg-brand/80"
          >
            Apply
          </button>
        ) : (
          <button
            disabled
            className="w-full rounded-lg bg-muted py-2 text-sm font-medium text-muted-foreground flex items-center justify-center gap-1.5"
          >
            <Lock className="h-3.5 w-3.5" />
            {entry.price} Credits
          </button>
        )}

        {/* Success toast */}
        {toast && (
          <p className="text-center text-xs font-medium text-emerald-400 animate-pulse">
            Theme applied!
          </p>
        )}
      </div>
    </div>
  );
}

function ThemesGrid() {
  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/15">
              <Palette className="h-5 w-5 text-brand-text" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold">Office Themes</h1>
              <p className="text-xs text-muted-foreground">Browse and apply themes to your virtual office</p>
            </div>
          </div>
        </div>

        {/* Theme cards grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {THEME_REGISTRY.map((entry) => (
              <ThemeCard key={entry.id} entry={entry} />
            ))}
          </div>
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function OfficeThemesPage() {
  return (
    <AuthGuard>
      <ThemeProvider>
        <ThemesGrid />
      </ThemeProvider>
    </AuthGuard>
  );
}
