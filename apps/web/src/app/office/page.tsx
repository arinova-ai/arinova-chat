"use client";

import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2 } from "lucide-react";
import { useOfficePlugin } from "@/hooks/use-office-plugin";
import { OfficeInstallGuide } from "@/components/office/install-guide";
import { OfficeView } from "@/components/office/office-view";

function OfficeContent() {
  const { state, retry } = useOfficePlugin();

  return (
    <div className="app-dvh flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 px-4 pt-[max(1.25rem,env(safe-area-inset-top,1.25rem))]">
        <div className="mx-auto flex max-w-6xl items-center gap-3 pb-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-blue-400" />
            <h1 className="text-2xl font-bold">Virtual Office</h1>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom,1rem))]">
        <div className="mx-auto h-full max-w-6xl">
          {state === "connected" ? (
            <OfficeView />
          ) : (
            <div className="max-w-4xl">
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
