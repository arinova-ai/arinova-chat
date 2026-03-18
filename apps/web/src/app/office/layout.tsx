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
import { THEME_RUNTIME_URL } from "@/lib/config";
import { useRouter } from "next/navigation";
function OfficeLayoutInner({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { themeId } = useTheme();
  const enterPip = useOfficePipStore((s) => s.enter);
  const router = useRouter();

  const handlePip = useCallback(() => {
    const src = `${THEME_RUNTIME_URL}/runtime/${encodeURIComponent(themeId)}`;
    enterPip(src, themeId);
    router.push("/");
  }, [themeId, enterPip, router]);

  return (
    <div className="app-dvh flex bg-background" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}>
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
