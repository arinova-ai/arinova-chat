"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { useSpacesStore } from "@/store/spaces-store";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Play,
  Gamepad2,
  Loader2,
  Users,
  Tag,
} from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  board_game: "bg-red-500/15 text-red-400",
  card_game: "bg-amber-500/15 text-amber-400",
  rpg: "bg-orange-500/15 text-orange-400",
  strategy: "bg-teal-500/15 text-teal-400",
  puzzle: "bg-purple-500/15 text-purple-400",
  trivia: "bg-pink-500/15 text-pink-400",
  social: "bg-blue-500/15 text-blue-400",
  other: "bg-gray-500/15 text-gray-400",
};

function SpaceDetailContent({ id }: { id: string }) {
  const router = useRouter();
  const { t } = useTranslation();
  const currentSpace = useSpacesStore((s) => s.currentSpace);
  const detailLoading = useSpacesStore((s) => s.detailLoading);
  const fetchSpaceDetail = useSpacesStore((s) => s.fetchSpaceDetail);
  const openPip = useSpacesStore((s) => s.openPip);

  useEffect(() => {
    fetchSpaceDetail(id);
  }, [id, fetchSpaceDetail]);

  if (detailLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!currentSpace) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background">
        <Gamepad2 className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">{t("spaces.gameNotFound")}</p>
        <Button variant="secondary" onClick={() => router.push("/spaces")}>
          {t("spaces.backToSpaces")}
        </Button>
      </div>
    );
  }

  const space = currentSpace;
  const catClass = CATEGORY_COLORS[space.category] ?? "bg-gray-500/15 text-gray-400";
  const iframeUrl = space.definition?.iframeUrl as string | undefined;
  const appId = space.definition?.appId as string | undefined;

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-4">
          <button
            onClick={() => router.push("/spaces")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("spaces.backToSpaces")}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-24 md:pb-6">
          <div className="mx-auto max-w-4xl p-6 space-y-8">
            {/* Banner */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand/20 via-purple-600/10 to-blue-600/10 border border-brand/20 p-6 md:p-8">
              <div className="flex flex-col md:flex-row items-start gap-5">
                <div className="flex h-24 w-24 md:h-28 md:w-28 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-5xl md:text-6xl">
                  🎮
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl md:text-3xl font-bold">{space.name}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${catClass}`}>
                      {t(`spaces.cat.${space.category}`)}
                    </span>
                    {space.owner && (
                      <span className="text-sm text-muted-foreground">
                        by {space.owner.name}
                      </span>
                    )}
                  </div>
                  {iframeUrl && (
                    <div className="mt-4">
                      <Button
                        className="brand-gradient-btn gap-2"
                        onClick={() => openPip(space.id, space.name, iframeUrl, appId)}
                      >
                        <Play className="h-4 w-4" />
                        {t("spaces.playNow")}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Info cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <Tag className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-1.5 text-xs text-muted-foreground">{t("common.category")}</p>
                <p className="text-sm font-semibold capitalize">{t(`spaces.cat.${space.category}`)}</p>
              </div>
              {space.owner && (
                <div className="rounded-xl border border-border bg-card p-3 text-center">
                  <Users className="mx-auto h-5 w-5 text-muted-foreground" />
                  <p className="mt-1.5 text-xs text-muted-foreground">{t("spaces.owner")}</p>
                  <p className="text-sm font-semibold truncate">{space.owner.name}</p>
                </div>
              )}
              {space.sessions && space.sessions.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-3 text-center">
                  <Gamepad2 className="mx-auto h-5 w-5 text-muted-foreground" />
                  <p className="mt-1.5 text-xs text-muted-foreground">{t("spaces.activeSessions")}</p>
                  <p className="text-sm font-semibold">{space.sessions.length}</p>
                </div>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t("spaces.about")}
              </h2>
              <p className="text-sm leading-relaxed text-foreground/90">
                {space.description}
              </p>
            </div>

            {/* Tags */}
            {space.tags.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("spaces.tags")}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {space.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function SpaceDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <SpaceDetailContent id={id} />
    </AuthGuard>
  );
}
