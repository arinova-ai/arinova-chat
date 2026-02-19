"use client";

import { use } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { AppDetailPage } from "@/components/apps/app-detail-page";

export default function AppDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <AppDetailPage appId={id} />
    </AuthGuard>
  );
}
