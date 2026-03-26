"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Building2, Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { assetUrl } from "@/lib/config";
import { useTranslation } from "@/lib/i18n";
import { useAccountStore } from "@/store/account-store";
import { useChatStore } from "@/store/chat-store";
import { GiftButton } from "@/components/accounts/gift-button";

interface OfficialDetail {
  id: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  coverImageUrl: string | null;
  subscriberCount: number;
  ownerName: string | null;
}

export default function OfficialDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const id = params.id as string;

  const subscribe = useAccountStore((s) => s.subscribe);
  const unsubscribe = useAccountStore((s) => s.unsubscribe);

  const [detail, setDetail] = useState<OfficialDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    setLoading(true);
    api<OfficialDetail>(`/api/official/${id}`)
      .then((d) => setDetail(d))
      .catch(() => {})
      .finally(() => setLoading(false));

    // Check subscription status
    api<{ subscribed: boolean }>(`/api/accounts/${id}/subscribe`, { method: "GET", silent: true })
      .then((d) => setIsSubscribed(d.subscribed))
      .catch(() => {});
  }, [id]);

  const handleToggleSubscribe = useCallback(async () => {
    setSubscribing(true);
    try {
      if (isSubscribed) {
        await unsubscribe(id);
        setIsSubscribed(false);
      } else {
        const res = await subscribe(id);
        setIsSubscribed(true);
        // Navigate to conversation
        if (res?.conversationId) {
          await useChatStore.getState().loadConversations();
          useChatStore.getState().setActiveConversation(res.conversationId);
          router.push("/");
        }
      }
    } catch {}
    setSubscribing(false);
  }, [id, isSubscribed, subscribe, unsubscribe, router]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background gap-3">
        <p className="text-sm text-muted-foreground">{t("official.detail.notFound")}</p>
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("common.back")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background pt-[env(safe-area-inset-top)]">
      {/* Cover Image */}
      <div className="relative shrink-0">
        {detail.coverImageUrl ? (
          <div className="h-40 w-full overflow-hidden">
            <img
              src={assetUrl(detail.coverImageUrl)}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="h-40 w-full bg-gradient-to-br from-blue-600/20 to-purple-600/20" />
        )}

        {/* Back button overlay */}
        <button
          type="button"
          onClick={() => router.back()}
          className="absolute left-3 top-3 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm hover:bg-black/60"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>

      {/* Profile section */}
      <div className="relative px-4 pb-4">
        {/* Avatar overlapping cover */}
        <div className="-mt-10 mb-3">
          <div className="h-20 w-20 rounded-full border-4 border-background bg-muted overflow-hidden">
            {detail.avatar ? (
              <img
                src={assetUrl(detail.avatar)}
                alt={detail.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Building2 className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>
        </div>

        {/* Name + subscriber count */}
        <h1 className="text-xl font-bold">{detail.name}</h1>
        <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span>{detail.subscriberCount} {t("explore.subscribers")}</span>
        </div>

        {/* Bio */}
        {detail.bio && (
          <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">{detail.bio}</p>
        )}

        {/* Action buttons */}
        <div className="mt-4 flex items-center gap-3">
          <Button
            className="flex-1"
            variant={isSubscribed ? "outline" : "default"}
            onClick={handleToggleSubscribe}
            disabled={subscribing}
          >
            {subscribing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {isSubscribed ? t("official.detail.unsubscribe") : t("explore.subscribe")}
          </Button>
          <GiftButton accountId={detail.id} />
        </div>
      </div>
    </div>
  );
}
