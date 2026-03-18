"use client";

import type { ReactNode } from "react";
import { useCallback } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Building2, PictureInPicture2 } from "lucide-react";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { PageTitle } from "@/components/ui/page-title";
import { OfficeTabs } from "@/components/office/office-tabs";
import { useTranslation } from "@/lib/i18n";
import { ThemeProvider, useTheme } from "@/components/office/theme-context";
import { useOfficePipStore } from "@/store/float-window-store";
import { useOfficeStream } from "@/hooks/use-office-stream";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
function OfficeLayoutInner({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { themeId } = useTheme();
  const enterPip = useOfficePipStore((s) => s.enter);
  const router = useRouter();
  const stream = useOfficeStream();
  const { data: session } = authClient.useSession();

  const handlePip = useCallback(() => {
    const sessionUser = session?.user as { id?: string; name?: string; username?: string } | undefined;
    const user = {
      id: sessionUser?.id ?? "",
      name: sessionUser?.name ?? "",
      username: sessionUser?.username ?? "",
    };
    enterPip(themeId, stream.agents, user);
    router.push("/");
  }, [themeId, enterPip, router, stream.agents, session]);

  return (
    <div className="app-dvh flex bg-background">
      {/* Desktop Icon Rail */}
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <PageTitle
              title={t("office.title")}
              subtitle={t("office.subtitle")}
              icon={Building2}
              className="flex-1 min-w-0"
            />
            <button
              type="button"
              onClick={handlePip}
              className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Picture-in-Picture"
            >
              <PictureInPicture2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="shrink-0 border-b border-border">
          <OfficeTabs />
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {children}
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function OfficeLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <ThemeProvider>
        <OfficeLayoutInner>{children}</OfficeLayoutInner>
      </ThemeProvider>
    </AuthGuard>
  );
}
