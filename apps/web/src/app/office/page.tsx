"use client";

import { AuthGuard } from "@/components/auth-guard";
import { Globe } from "lucide-react";
import { useOfficePlugin } from "@/hooks/use-office-plugin";
import { OfficeInstallGuide } from "@/components/office/install-guide";
import { OfficeView } from "@/components/office/office-view";
import { IconRail } from "@/components/chat/icon-rail";

function OfficeContent() {
  const { state, retry } = useOfficePlugin();

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
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[oklch(0.55_0.2_250/15%)]">
              <Globe className="h-5 w-5 text-[oklch(0.7_0.18_250)]" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Spaces</h1>
              <p className="text-xs text-muted-foreground">Virtual Office & Team Collaboration</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {state === "connected" ? (
            <OfficeView />
          ) : (
            <div className="mx-auto max-w-3xl">
              <OfficeInstallGuide state={state} onRetry={retry} />
            </div>
          )}
        </div>
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
