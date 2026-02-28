"use client";

import { useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Building2, Radio, Monitor, Zap } from "lucide-react";
import { useOfficePlugin } from "@/hooks/use-office-plugin";
import { OfficeView } from "@/components/office/office-view";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { PageTitle } from "@/components/ui/page-title";
import { ThemeProvider, useTheme } from "@/components/office/theme-context";
import type { ThemeQuality } from "@/components/office/theme-types";

const THEME_QUALITY_KEY = "arinova_theme_quality";

function readQuality(): ThemeQuality {
  if (typeof window === "undefined") return "high";
  const saved = localStorage.getItem(THEME_QUALITY_KEY);
  return saved === "performance" ? "performance" : "high";
}

function OfficeContent() {
  const { state } = useOfficePlugin();
  const { manifest } = useTheme();
  const [quality, setQuality] = useState<ThemeQuality>(readQuality);
  const isThreeJS = manifest?.renderer === "threejs";

  const toggleQuality = () => {
    const next: ThemeQuality = quality === "high" ? "performance" : "high";
    setQuality(next);
    localStorage.setItem(THEME_QUALITY_KEY, next);
    window.dispatchEvent(new Event("arinova:quality-change"));
  };

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
              title="Office"
              subtitle="Virtual Workspace"
              icon={Building2}
              className="flex-1 min-w-0"
            />

            {/* Quality toggle — only for ThreeJS renderer */}
            {isThreeJS && (
              <button
                type="button"
                onClick={toggleQuality}
                className="flex items-center gap-1.5 rounded-full border border-brand-text/30 bg-secondary px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-secondary/80"
                title={quality === "high" ? "Switch to Performance mode" : "Switch to High Resolution"}
              >
                {quality === "high" ? (
                  <>
                    <Monitor className="h-4 w-4 text-brand-text" />
                    <span className="text-foreground">High Res</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 text-yellow-400" />
                    <span className="text-foreground">Performance</span>
                  </>
                )}
              </button>
            )}

            {state !== "connected" && state !== "loading" && (
              <div className="flex items-center gap-1.5 rounded-full bg-yellow-500/10 px-3 py-1">
                <Radio className="h-3 w-3 text-yellow-500" />
                <span className="text-xs font-medium text-yellow-500">Offline</span>
              </div>
            )}
          </div>
        </div>

        {/* Body — always show OfficeView */}
        <div className="flex-1 min-h-0 overflow-hidden p-3 md:p-4">
          <OfficeView />
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function OfficePage() {
  return (
    <AuthGuard>
      <ThemeProvider>
        <OfficeContent />
      </ThemeProvider>
    </AuthGuard>
  );
}
