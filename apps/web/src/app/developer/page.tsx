"use client";

import { AuthGuard } from "@/components/auth-guard";
import { DeveloperConsolePage } from "@/components/developer/developer-console-page";

export default function DeveloperPage() {
  return (
    <AuthGuard>
      <DeveloperConsolePage />
    </AuthGuard>
  );
}
