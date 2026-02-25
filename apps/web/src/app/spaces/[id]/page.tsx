"use client";

import { use } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { SpaceDetailPage } from "@/components/spaces/space-detail-page";

export default function SpaceDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <SpaceDetailPage spaceId={id} />
    </AuthGuard>
  );
}
