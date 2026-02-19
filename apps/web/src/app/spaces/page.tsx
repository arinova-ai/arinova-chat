"use client";

import { AuthGuard } from "@/components/auth-guard";
import { SpacesListPage } from "@/components/spaces/spaces-list-page";

export default function SpacesPage() {
  return (
    <AuthGuard>
      <SpacesListPage />
    </AuthGuard>
  );
}
