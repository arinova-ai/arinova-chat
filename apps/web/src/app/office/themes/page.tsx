"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Palette, Check, Lock, Users, Search } from "lucide-react";
import { PageTitle } from "@/components/ui/page-title";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { ThemeProvider, useTheme } from "@/components/office/theme-context";
import type { ThemeEntry } from "@/components/office/theme-registry";
import { useTranslation } from "@/lib/i18n";

function ThemeCard({ entry }: { entry: ThemeEntry }) {
  const { themeId, switchTheme, ownedThemes, refreshOwned } = useTheme();
  const { t } = useTranslation();
  const [toast, setToast] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActive = themeId === entry.id;
  const isFree = entry.price === "free";
  const isOwned = ownedThemes.has(entry.id);
  const isPremium = !isFree;

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  const showToast = () => {
    setToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), 2000);
  };

  const handleApply = () => {
    if (isActive) return;
    if (!isFree && !isOwned) return;
    switchTheme(entry.id);
    showToast();
  };

  const handlePurchase = async () => {
    if (purchasing || isFree || isOwned) return;
    setPurchasing(true);
    try {
      const res = await fetch(`/api/themes/${entry.id}/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ price: entry.price }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Purchase failed");
        return;
      }
      await refreshOwned();
      switchTheme(entry.id);
      showToast();
    } catch {
      alert("Purchase failed. Please try again.");
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <div className="group relative rounded-xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-lg hover:shadow-brand/5">
      {/* Preview image — links to detail page */}
      <Link href={`/office/themes/${entry.id}`} className="block relative aspect-video overflow-hidden">
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
              {t("theme.premium")}
            </span>
          </div>
        )}
      </Link>

      {/* Card body */}
      <div className="p-4 space-y-3">
        {/* Name + price */}
        <div className="flex items-center justify-between gap-2">
          <Link href={`/office/themes/${entry.id}`} className="font-semibold text-foreground truncate hover:text-brand-text transition-colors">
            {entry.name}
          </Link>
          {isFree ? (
            <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
              {t("theme.free")}
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
              {entry.price} {t("theme.credits")}
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2">{entry.description}</p>

        {/* Meta: agents + tags */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {entry.maxAgents} {entry.maxAgents === 1 ? t("theme.agent") : t("theme.agents")}
          </span>
          <span className="text-muted-foreground/40">|</span>
          <span className="truncate">
            {entry.tags.map((tag) => `#${tag}`).join(" ")}
          </span>
        </div>

        {/* Action button */}
        {isActive ? (
          <button
            disabled
            className="w-full rounded-lg bg-emerald-500/15 py-2 text-sm font-medium text-emerald-400 flex items-center justify-center gap-1.5"
          >
            <Check className="h-4 w-4" />
            {t("theme.applied")}
          </button>
        ) : isFree || isOwned ? (
          <button
            onClick={handleApply}
            className="w-full rounded-lg bg-brand py-2 text-sm font-medium text-brand-text transition-colors hover:bg-brand/80"
          >
            {t("theme.apply")}
          </button>
        ) : (
          <button
            onClick={handlePurchase}
            disabled={purchasing}
            className="w-full rounded-lg bg-brand py-2 text-sm font-medium text-brand-text transition-colors hover:bg-brand/80 disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {purchasing ? (
              <span className="animate-spin h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full" />
            ) : (
              <Lock className="h-3.5 w-3.5" />
            )}
            {entry.price} {t("theme.credits")}
          </button>
        )}

        {/* Success toast */}
        {toast && (
          <p className="text-center text-xs font-medium text-emerald-400 animate-pulse">
            {t("theme.themeApplied")}
          </p>
        )}
      </div>
    </div>
  );
}

function ThemesGrid() {
  const { t } = useTranslation();
  const { themes } = useTheme();
  const [search, setSearch] = useState("");
  const [priceFilter, setPriceFilter] = useState<"all" | "free" | "premium">("all");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const entry of themes) {
      for (const tag of entry.tags) tags.add(tag);
    }
    return Array.from(tags).sort();
  }, [themes]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return themes.filter((entry) => {
      if (priceFilter === "free" && entry.price !== "free") return false;
      if (priceFilter === "premium" && entry.price === "free") return false;
      if (selectedTags.size > 0 && !entry.tags.some((tag) => selectedTags.has(tag))) return false;
      if (q) {
        const haystack = `${entry.name} ${entry.description} ${entry.tags.join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [themes, search, priceFilter, selectedTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-5">
          <PageTitle
            title={t("theme.title")}
            subtitle={t("theme.subtitle")}
            icon={Palette}
          />
        </div>

        {/* Search + filters */}
        <div className="shrink-0 border-b border-border px-6 py-3 space-y-3">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={t("theme.searchPlaceholder")}
              aria-label={t("theme.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted/50 py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Price filter chips */}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Price filter">
            {(["all", "free", "premium"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setPriceFilter(value)}
                aria-pressed={priceFilter === value}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  priceFilter === value
                    ? "bg-brand text-brand-text"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {t(`theme.filter.${value}`)}
              </button>
            ))}
          </div>

          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tag filter">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  aria-pressed={selectedTags.has(tag)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    selectedTags.has(tag)
                      ? "bg-brand/20 text-brand-text ring-1 ring-brand/40"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Theme cards grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              {t("theme.noResults")}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {filtered.map((entry) => (
                <ThemeCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
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
