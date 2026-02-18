"use client";

import { use } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { PlaygroundDetailPage } from "@/components/playground/playground-detail-page";

export default function PlaygroundDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <PlaygroundDetailPage playgroundId={id} />
    </AuthGuard>
  );
}
