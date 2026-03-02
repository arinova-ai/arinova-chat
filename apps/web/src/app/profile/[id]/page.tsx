"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { assetUrl } from "@/lib/config";
import { ArrowLeft, CalendarDays, Settings, X } from "lucide-react";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { ArinovaSpinner } from "@/components/ui/arinova-spinner";
import { useTranslation } from "@/lib/i18n";
import { authClient } from "@/lib/auth-client";

interface UserProfile {
  id: string;
  name: string;
  image: string | null;
  username: string | null;
  bio?: string | null;
  coverImage?: string | null;
  createdAt?: string;
  isVerified?: boolean;
}

function UserProfileContent() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;
  const { data: session } = authClient.useSession();
  const isOwnProfile = session?.user?.id === userId;

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [lightboxOpen, closeLightbox]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<UserProfile>(`/api/users/${userId}`)
      .then((data) => {
        if (!cancelled) setUser(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => router.back()}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-base font-semibold">{t("userProfile.title")}</h1>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl">
            {loading && (
              <div className="flex justify-center py-16">
                <ArinovaSpinner />
              </div>
            )}

            {!loading && !user && (
              <p className="text-center text-sm text-muted-foreground py-16">
                {t("profilePage.userNotFound")}
              </p>
            )}

            {user && (
              <>
                {/* Banner / Cover */}
                <div className="relative h-32 md:h-44 overflow-hidden">
                  {user.coverImage ? (
                    <img
                      src={assetUrl(user.coverImage)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-r from-brand/30 via-brand/15 to-accent/30" />
                  )}
                </div>

                {/* Profile info */}
                <div className="px-6 pb-6">
                  {/* Avatar overlapping banner */}
                  <div className="flex items-end justify-between">
                    <button
                      type="button"
                      onClick={() => { if (user.image) setLightboxOpen(true); }}
                      className={user.image ? "cursor-pointer" : "cursor-default"}
                    >
                      <Avatar className="h-20 w-20 -mt-10 ring-4 ring-background">
                        {user.image ? (
                          <AvatarImage
                            src={assetUrl(user.image)}
                            alt={user.name ?? user.username ?? ""}
                          />
                        ) : null}
                        <AvatarFallback className="text-2xl bg-accent">
                          {(user.name ?? user.username ?? "?")
                            .charAt(0)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </button>

                    {isOwnProfile && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 gap-1.5"
                        onClick={() => router.push("/settings")}
                      >
                        <Settings className="h-3.5 w-3.5" />
                        {t("userProfile.editProfile")}
                      </Button>
                    )}
                  </div>

                  {/* Name + username */}
                  <div className="mt-3">
                    <h2 className="flex items-center gap-1.5 text-xl font-bold text-foreground">
                      {user.name}
                      {user.isVerified && <VerifiedBadge className="h-5 w-5 text-blue-500" />}
                    </h2>
                    {user.username && (
                      <p className="text-sm text-muted-foreground">
                        @{user.username}
                      </p>
                    )}
                  </div>

                  {/* Bio */}
                  {user.bio && (
                    <p className="mt-3 text-sm text-foreground/80 whitespace-pre-wrap">
                      {user.bio}
                    </p>
                  )}

                  {/* Join date */}
                  {user.createdAt && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      <span>
                        {t("userProfile.joined")}{" "}
                        {new Date(user.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <MobileBottomNav />
      </div>

      {lightboxOpen && user?.image &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={closeLightbox}
          >
            <button
              className="absolute right-4 rounded-full bg-card/80 p-3 text-white hover:bg-accent transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              style={{ top: "max(1rem, env(safe-area-inset-top, 1rem))" }}
              onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
            >
              <X className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assetUrl(user.image)}
              alt={user.name ?? user.username ?? ""}
              className="max-h-[80vh] max-w-[80vw] object-contain animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

export default function UserProfilePage() {
  return (
    <AuthGuard>
      <UserProfileContent />
    </AuthGuard>
  );
}
