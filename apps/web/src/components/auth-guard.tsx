"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Loader2 } from "lucide-react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login");
    }
  }, [isPending, session, router]);

  // Redirect to username setup if authenticated but no username set
  useEffect(() => {
    if (
      !isPending &&
      session?.user &&
      !(session.user as Record<string, unknown>).username
    ) {
      router.push("/setup-username");
    }
  }, [isPending, session, router]);

  if (isPending) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return null;

  // Don't render children until username is confirmed
  if (!(session.user as Record<string, unknown>).username) return null;

  return <>{children}</>;
}
