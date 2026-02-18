"use client";

import { AuthGuard } from "@/components/auth-guard";
import { PlaygroundListPage } from "@/components/playground/playground-list-page";

export default function PlaygroundPage() {
  return (
    <AuthGuard>
      <PlaygroundListPage />
    </AuthGuard>
  );
}
