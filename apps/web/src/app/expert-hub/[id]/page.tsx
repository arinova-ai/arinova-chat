"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArinovaSpinner } from "@/components/ui/arinova-spinner";
import { ArrowLeft, Coins, MessageCircle, Star, Lightbulb } from "lucide-react";
import { assetUrl } from "@/lib/config";

interface Expert {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  category: string;
  pricePerAsk: number;
  mode: string;
  isPublished: boolean;
  freeTrialCount: number;
  totalAsks: number;
  avgRating: number | null;
  createdAt: string;
  owner: { name: string; image: string | null; username: string | null } | null;
  examples: { id: string; question: string; answer: string; sortOrder: number }[];
}

function ExpertDetailContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const expertId = params.id as string;
  const [expert, setExpert] = useState<Expert | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!expertId) return;
    setLoading(true);
    api<Expert>(`/api/expert-hub/${expertId}`)
      .then(setExpert)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [expertId]);

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-4 md:px-6 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-semibold truncate">{expert?.name ?? t("expertHub.detail")}</h1>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-24 md:pb-0 px-4 md:px-6 py-6">
          {loading ? (
            <div className="flex justify-center py-12"><ArinovaSpinner size="sm" /></div>
          ) : !expert ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Lightbulb className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{t("expertHub.notFound")}</p>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-6">
              {/* Profile */}
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16 shrink-0">
                  {expert.avatarUrl ? <AvatarImage src={assetUrl(expert.avatarUrl)} /> : null}
                  <AvatarFallback className="bg-accent text-xl">{expert.name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold">{expert.name}</h2>
                  {expert.owner && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("expertHub.by")} {expert.owner.name}
                      {expert.owner.username && <span className="ml-1">@{expert.owner.username}</span>}
                    </p>
                  )}
                  {expert.description && (
                    <p className="text-sm text-muted-foreground mt-2">{expert.description}</p>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-sm">
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">{expert.category}</span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Coins className="h-3.5 w-3.5" />
                  {expert.pricePerAsk} {t("expertHub.coinPerAsk")}
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <MessageCircle className="h-3.5 w-3.5" />
                  {expert.totalAsks} {t("expertHub.asks")}
                </span>
                {expert.avgRating != null && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Star className="h-3.5 w-3.5 text-yellow-500" />
                    {expert.avgRating.toFixed(1)}
                  </span>
                )}
              </div>
              {expert.freeTrialCount > 0 && (
                <p className="text-xs text-green-600 font-medium">{t("expertHub.freeTrial", { count: expert.freeTrialCount })}</p>
              )}

              {/* Ask button */}
              <Button
                className="w-full gap-2"
                onClick={() => router.push(`/expert-hub/chat/${expert.id}`)}
              >
                <MessageCircle className="h-4 w-4" />
                {t("expertHub.askButton")}
              </Button>

              {/* Examples */}
              {expert.examples.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">{t("expertHub.exampleQA")}</h3>
                  {expert.examples.map((ex) => (
                    <div key={ex.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Q:</p>
                        <p className="text-sm">{ex.question}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">A:</p>
                        <p className="text-sm text-muted-foreground">{ex.answer}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function ExpertDetailPage() {
  return (
    <AuthGuard>
      <ExpertDetailContent />
    </AuthGuard>
  );
}
