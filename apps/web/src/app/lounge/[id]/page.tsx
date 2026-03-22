"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Mic, Users, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthGuard } from "@/components/auth-guard";
import { DefaultAvatarPicker } from "@/components/ui/default-avatar-picker";

interface LoungeDetail {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  subscriberCount: number;
  voiceModelStatus: string;
}

function LoungeDetailInner() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [lounge, setLounge] = useState<LoungeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profileNickname, setProfileNickname] = useState("");
  const [profileAvatar, setProfileAvatar] = useState("");
  const [joinedConvId, setJoinedConvId] = useState<string | null>(null);

  useEffect(() => {
    api<LoungeDetail>(`/api/lounge/${id}`)
      .then(setLounge)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleJoin = async () => {
    setJoining(true);
    try {
      const res = await api<{ conversationId: string }>(`/api/lounge/${id}/join`, { method: "POST" });
      setJoinedConvId(res.conversationId);
      setShowProfile(true);
    } catch {
      try {
        const res = await api<{ conversationId: string }>(`/api/lounge/${id}/start-chat`, { method: "POST" });
        setJoinedConvId(res.conversationId);
        setShowProfile(true);
      } catch { /* toast handled by api */ }
    }
    setJoining(false);
  };

  const handleProfileDone = async () => {
    if (!joinedConvId) return;
    // Get community ID for identity update
    try {
      const comm = await api<{ id: string }>(`/api/communities/by-conversation/${joinedConvId}`);
      if (comm.id && (profileNickname.trim() || profileAvatar)) {
        await api(`/api/communities/${comm.id}/identity`, {
          method: "PATCH",
          body: JSON.stringify({
            displayName: profileNickname.trim() || "Anonymous",
            avatarUrl: profileAvatar || null,
          }),
        });
      }
    } catch { /* ignore */ }
    router.push(`/?c=${joinedConvId}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!lounge) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-muted-foreground">{t("common.notFound")}</p>
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {t("common.back")}
        </Button>
      </div>
    );
  }

  // Profile setup dialog after join
  if (showProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background px-6 gap-6">
        <div className="text-center">
          <h2 className="text-lg font-semibold">{t("community.setupProfile")}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t("community.setupProfileDesc")}</p>
        </div>
        <div className="w-full max-w-sm space-y-4">
          <div>
            <label className="text-sm font-medium">{t("community.nickname")}</label>
            <Input
              value={profileNickname}
              onChange={(e) => setProfileNickname(e.target.value)}
              placeholder={t("community.nicknamePlaceholder")}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">{t("community.avatar")}</label>
            <DefaultAvatarPicker
              onSelect={setProfileAvatar}
              selected={profileAvatar}
              className="mt-1"
            />
          </div>
          <Button className="w-full" onClick={handleProfileDone}>
            {t("community.startChatting")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Cover / Header */}
      <div className="relative shrink-0">
        {lounge.coverImageUrl ? (
          <img src={lounge.coverImageUrl} alt="" className="w-full h-48 object-cover" />
        ) : (
          <div className="w-full h-48 bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
            <Mic className="h-16 w-16 text-purple-500/30" />
          </div>
        )}
        <button
          type="button"
          onClick={() => router.back()}
          className="absolute top-3 left-3 rounded-full bg-background/80 backdrop-blur p-2"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Avatar + Info */}
      <div className="px-4 -mt-8 relative">
        <div className="h-16 w-16 rounded-full border-4 border-background bg-purple-500/10 flex items-center justify-center overflow-hidden">
          {lounge.avatarUrl ? (
            <img src={lounge.avatarUrl} alt={lounge.name} className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <Mic className="h-8 w-8 text-purple-500" />
          )}
        </div>
      </div>

      <div className="px-4 pt-3 pb-4 space-y-3">
        <div>
          <h1 className="text-xl font-bold">{lounge.name}</h1>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
            <Users className="h-3.5 w-3.5" />
            <span>{lounge.subscriberCount} {t("explore.subscribers")}</span>
          </div>
        </div>

        {lounge.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{lounge.description}</p>
        )}

        <Button
          className="w-full gap-2"
          size="lg"
          onClick={handleJoin}
          disabled={joining}
        >
          {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
          {t("lounge.joinChat")}
        </Button>
      </div>
    </div>
  );
}

export default function LoungeDetailPage() {
  return (
    <AuthGuard>
      <LoungeDetailInner />
    </AuthGuard>
  );
}
