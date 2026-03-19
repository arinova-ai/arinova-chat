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
import { ArrowLeft, CalendarDays, Phone, Settings, X, ShieldBan, VolumeX, Loader2, UserPlus, UserMinus, Clock, Monitor } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { useVoiceCallStore } from "@/store/voice-call-store";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { useTranslation } from "@/lib/i18n";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

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
  const [isBlocked, setIsBlocked] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [friendStatus, setFriendStatus] = useState<"none" | "friend" | "pending_outgoing" | "pending_incoming">("none");
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const conversations = useChatStore((s) => s.conversations);
  const blockedUserIds = useChatStore((s) => s.blockedUserIds);
  const voiceCallState = useVoiceCallStore((s) => s.callState);
  const startCall = useVoiceCallStore((s) => s.startCall);
  const isInCall = voiceCallState !== "idle";
  const directConv = conversations.find((c) => c.peerUserId === userId && (c.type === "h2h" || c.type === "direct"));

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

  // Check block/mute status
  useEffect(() => {
    if (isOwnProfile) return;
    setIsBlocked(blockedUserIds.has(userId));
    api<Array<{ id: string }>>("/api/users/muted")
      .then((list) => setIsMuted(list.some((u) => u.id === userId)))
      .catch(() => {});
  }, [userId, isOwnProfile, blockedUserIds]);

  // Check friend status
  useEffect(() => {
    if (isOwnProfile) return;
    let cancelled = false;
    Promise.all([
      api<Array<{ id: string }>>("/api/friends"),
      api<{ incoming: Array<{ id: string; userId: string }>; outgoing: Array<{ id: string; userId: string }> }>("/api/friends/requests"),
    ])
      .then(([friends, requests]) => {
        if (cancelled) return;
        if (friends.some((f) => f.id === userId)) {
          setFriendStatus("friend");
        } else {
          const incoming = requests.incoming.find((r) => r.userId === userId);
          const outgoing = requests.outgoing.find((r) => r.userId === userId);
          if (incoming) {
            setFriendStatus("pending_incoming");
            setFriendshipId(incoming.id);
          } else if (outgoing) {
            setFriendStatus("pending_outgoing");
            setFriendshipId(outgoing.id);
          } else {
            setFriendStatus("none");
          }
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, isOwnProfile]);

  const handleToggleBlock = async () => {
    setActionLoading("block");
    try {
      if (isBlocked) {
        await useChatStore.getState().unblockUser(userId);
        setIsBlocked(false);
      } else {
        await useChatStore.getState().blockUser(userId);
        setIsBlocked(true);
      }
    } catch {}
    setActionLoading(null);
  };

  const handleToggleMute = async () => {
    setActionLoading("mute");
    try {
      if (isMuted) {
        await api(`/api/users/${userId}/mute`, { method: "DELETE" });
        setIsMuted(false);
      } else {
        await api(`/api/users/${userId}/mute`, { method: "POST" });
        setIsMuted(true);
      }
    } catch {}
    setActionLoading(null);
  };

  const handleFriendAction = async () => {
    setActionLoading("friend");
    try {
      if (friendStatus === "friend") {
        await api(`/api/friends/${userId}`, { method: "DELETE" });
        setFriendStatus("none");
        setFriendshipId(null);
      } else if (friendStatus === "pending_incoming" && friendshipId) {
        await api(`/api/friends/accept/${friendshipId}`, { method: "POST" });
        setFriendStatus("friend");
        setFriendshipId(null);
      } else if (friendStatus === "none" && user?.username) {
        await api("/api/friends/request", {
          method: "POST",
          body: JSON.stringify({ username: user.username }),
        });
        setFriendStatus("pending_outgoing");
      }
    } catch {}
    setActionLoading(null);
  };

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
              <div>
                {/* Skeleton banner */}
                <div className="h-32 md:h-44 animate-pulse bg-muted" />
                <div className="px-6 pb-6">
                  <div className="flex items-end justify-between">
                    <div className="h-20 w-20 -mt-10 rounded-full animate-pulse bg-muted ring-4 ring-background" />
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="h-6 w-40 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                    <div className="mt-3 h-4 w-64 animate-pulse rounded bg-muted" />
                  </div>
                </div>
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

                  {/* Friend / Block / Mute / Call actions (not shown on own profile) */}
                  {!isOwnProfile && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {directConv && (
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn("gap-1.5", isInCall && "text-green-400")}
                          disabled={isInCall}
                          onClick={() => {
                            if (!isInCall && user) {
                              startCall(directConv.id, { targetUserId: userId }, user.name, user.image, "native");
                            }
                          }}
                          title={isInCall ? t("voice.inCall") : t("voice.startCall")}
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {isInCall ? t("voice.inCall") : t("voice.startCall")}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className={`gap-1.5 ${friendStatus === "friend" ? "text-green-500 border-green-500/40" : friendStatus === "pending_outgoing" ? "text-muted-foreground" : ""}`}
                        disabled={actionLoading === "friend" || friendStatus === "pending_outgoing"}
                        onClick={handleFriendAction}
                      >
                        {actionLoading === "friend" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : friendStatus === "friend" ? (
                          <UserMinus className="h-3.5 w-3.5" />
                        ) : friendStatus === "pending_outgoing" ? (
                          <Clock className="h-3.5 w-3.5" />
                        ) : (
                          <UserPlus className="h-3.5 w-3.5" />
                        )}
                        {friendStatus === "friend"
                          ? t("userProfile.removeFriend")
                          : friendStatus === "pending_outgoing"
                            ? t("userProfile.pendingRequest")
                            : friendStatus === "pending_incoming"
                              ? t("userProfile.acceptRequest")
                              : t("userProfile.addFriend")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={async () => {
                          try {
                            const data = await api<{ userId: string; readOnly: boolean }>(`/api/user/${userId}/office-visit`);
                            if (data.userId) {
                              window.location.href = `/office?visit=${userId}`;
                            }
                          } catch {
                            // toast handled by api
                          }
                        }}
                      >
                        <Monitor className="h-3.5 w-3.5" />
                        {t("userProfile.visitOffice")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`gap-1.5 ${isBlocked ? "text-red-400 border-red-500/40" : ""}`}
                        disabled={actionLoading === "block"}
                        onClick={handleToggleBlock}
                      >
                        {actionLoading === "block" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ShieldBan className="h-3.5 w-3.5" />
                        )}
                        {isBlocked ? "Unblock" : "Block"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`gap-1.5 ${isMuted ? "text-orange-400 border-orange-500/40" : ""}`}
                        disabled={actionLoading === "mute"}
                        onClick={handleToggleMute}
                      >
                        {actionLoading === "mute" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <VolumeX className="h-3.5 w-3.5" />
                        )}
                        {isMuted ? "Unmute" : "Mute"}
                      </Button>
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
