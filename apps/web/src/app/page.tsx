"use client";

import { AuthGuard } from "@/components/auth-guard";
import { ChatLayout } from "@/components/chat/chat-layout";

export default function Home() {
  return (
    <AuthGuard>
      <ChatLayout />
    </AuthGuard>
  );
}
