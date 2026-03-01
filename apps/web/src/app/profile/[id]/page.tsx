"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { assetUrl } from "@/lib/config";
import { ArrowLeft } from "lucide-react";
import { ArinovaSpinner } from "@/components/ui/arinova-spinner";
import { useTranslation } from "@/lib/i18n";

interface UserProfile {
  id: string;
  name: string;
  image: string | null;
  username: string | null;
  bio?: string | null;
  createdAt?: string;
}

function UserProfileContent() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user profile
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
          <div className="mx-auto max-w-2xl px-4 py-6">
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
                {/* Profile card */}
                <div className="flex flex-col items-center text-center">
                  <Avatar className="h-20 w-20">
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

                  <h2 className="mt-3 text-lg font-semibold text-foreground">
                    {user.name}
                  </h2>

                  {user.username && (
                    <p className="text-sm text-muted-foreground">
                      @{user.username}
                    </p>
                  )}

                  {user.bio && (
                    <p className="mt-2 text-sm text-muted-foreground max-w-md">
                      {user.bio}
                    </p>
                  )}

                  {user.createdAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("userProfile.joined")}{" "}
                      {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  )}
                </div>

              </>
            )}
          </div>
        </div>

        <MobileBottomNav />
      </div>
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
