"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { ThemeProvider } from "@/components/office/theme-context";
import { ThemeIframe } from "@/components/office/theme-iframe";
import { ArinovaSpinner } from "@/components/ui/arinova-spinner";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { authClient } from "@/lib/auth-client";
import type { Agent } from "@/components/office/types";

interface VisitData {
  userId: string;
  name: string;
  image: string | null;
  themeId: string | null;
  agents: { id: string; name: string; avatarUrl: string | null; slotIndex: number }[];
  readOnly: boolean;
}

function makeEmptySlot(index: number): Agent {
  return {
    id: `empty-${index}`,
    name: "Not Connected",
    status: "unbound",
    emoji: "\u{1F4A4}",
    role: "",
    color: "#666",
    recentActivity: [],
  };
}

function VisitOfficeContent() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const visitUserId = params.userId as string;

  const [visitData, setVisitData] = useState<VisitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: session } = authClient.useSession();
  const sessionUser = session?.user as { id?: string; name?: string; username?: string } | undefined;
  const iframeUser = {
    id: sessionUser?.id ?? "",
    name: sessionUser?.name ?? "",
    username: sessionUser?.username ?? "",
  };

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    api<VisitData>(`/api/user/${visitUserId}/office-visit`)
      .then(setVisitData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [visitUserId]);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setMapSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading]);

  const maxAgents = 6;
  const slots: Agent[] = visitData
    ? Array.from({ length: maxAgents }, (_, i) => {
        const va = visitData.agents.find((a) => a.slotIndex === i);
        if (va) {
          return {
            id: va.id,
            name: va.name,
            role: "",
            emoji: "\u{1F916}",
            color: "#64748b",
            status: "idle" as const,
            recentActivity: [],
          };
        }
        return makeEmptySlot(i);
      })
    : [];

  const themeId = visitData?.themeId ?? "cozy-studio-v2";
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const noop = useCallback(() => {}, []);

  if (loading) {
    return (
      <div className="app-dvh flex items-center justify-center bg-background">
        <ArinovaSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-dvh flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <p className="text-sm">{error}</p>
        <button type="button" onClick={() => router.back()} className="text-xs text-brand hover:underline">
          {t("common.back")}
        </button>
      </div>
    );
  }

  return (
    <div className="app-dvh flex flex-col bg-background">
      {/* Visit banner */}
      <div className="shrink-0 flex items-center gap-2 border-b border-brand/20 bg-brand/10 px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md p-1 hover:bg-brand/20 text-brand transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-brand">
          {t("office.visiting", { name: visitData?.name ?? "" })}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">{t("office.readOnly")}</span>
      </div>

      {/* Theme scene */}
      <div ref={mapContainerRef} className="flex-1 min-h-0">
        {mapSize.width > 0 && mapSize.height > 0 && (
          <ThemeIframe
            themeId={themeId}
            agents={slots}
            user={iframeUser}
            width={mapSize.width}
            height={mapSize.height}
            isMobile={isMobile}
            onSelectAgent={noop}
            onOpenChat={noop}
          />
        )}
      </div>

      <MobileBottomNav />
    </div>
  );
}

export default function VisitOfficePage() {
  return (
    <AuthGuard>
      <ThemeProvider>
        <VisitOfficeContent />
      </ThemeProvider>
    </AuthGuard>
  );
}
