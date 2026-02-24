"use client";

import { AuthGuard } from "@/components/auth-guard";
import { Palette } from "lucide-react";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";

function ThemesContent() {
  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        <div className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/15">
              <Palette className="h-5 w-5 text-brand-text" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold">Office Themes</h1>
              <p className="text-xs text-muted-foreground">Customise your virtual office</p>
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center p-6">
          <div className="text-center space-y-3">
            <Palette className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <h2 className="text-lg font-semibold text-muted-foreground">Coming Soon</h2>
            <p className="text-sm text-muted-foreground/60 max-w-xs">
              Theme customisation is under development. Stay tuned!
            </p>
          </div>
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function OfficeThemesPage() {
  return (
    <AuthGuard>
      <ThemesContent />
    </AuthGuard>
  );
}
