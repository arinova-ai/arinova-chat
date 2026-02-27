"use client";

import { AuthGuard } from "@/components/auth-guard";
import { Building2, Radio } from "lucide-react";
import { useOfficePlugin } from "@/hooks/use-office-plugin";
import { OfficeView } from "@/components/office/office-view";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { PageTitle } from "@/components/ui/page-title";

function OfficeContent() {
  const { state } = useOfficePlugin();

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
            {state !== "connected" && state !== "loading" && (
              <div className="flex items-center gap-1.5 rounded-full bg-yellow-500/10 px-3 py-1">
                <Radio className="h-3 w-3 text-yellow-500" />
                <span className="text-xs font-medium text-yellow-500">Demo</span>
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
      <OfficeContent />
    </AuthGuard>
  );
}
