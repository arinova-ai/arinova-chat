"use client";

import { AuthGuard } from "@/components/auth-guard";
import { AppDirectoryPage } from "@/components/apps/app-directory-page";

export default function AppsPage() {
  return (
    <AuthGuard>
      <AppDirectoryPage />
    </AuthGuard>
  );
}
