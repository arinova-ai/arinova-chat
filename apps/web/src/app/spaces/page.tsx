"use client";

import { AuthGuard } from "@/components/auth-guard";
import { Globe } from "lucide-react";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { PageTitle } from "@/components/ui/page-title";

function SpacesContent() {
  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        <div className="shrink-0 border-b border-border px-6 py-4">
          <PageTitle
            title="Spaces"
            subtitle="Organize your projects and ideas"
            icon={Globe}
          />
        </div>

        <div className="flex flex-1 items-center justify-center p-6">
          <div className="text-center space-y-3">
            <Globe className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <h2 className="text-lg font-semibold text-muted-foreground">Coming Soon</h2>
            <p className="text-sm text-muted-foreground/60 max-w-xs">
              Spaces is under development. Stay tuned!
            </p>
          </div>
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function SpacesPage() {
  return (
    <AuthGuard>
      <SpacesContent />
    </AuthGuard>
  );
}
