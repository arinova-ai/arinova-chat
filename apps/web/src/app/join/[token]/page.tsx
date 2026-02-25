"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useChatStore } from "@/store/chat-store";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type JoinState = "loading" | "success" | "error" | "auth_required";

export default function JoinGroupPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const joinViaInvite = useChatStore((s) => s.joinViaInvite);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  const [state, setState] = useState<JoinState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (sessionPending) return;

    if (!session?.user) {
      setState("auth_required");
      return;
    }

    let cancelled = false;

    async function join() {
      try {
        const convId = await joinViaInvite(token);
        if (cancelled) return;
        setConversationId(convId);
        setState("success");
      } catch (err) {
        if (cancelled) return;
        setState("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to join group"
        );
      }
    }

    join();
    return () => {
      cancelled = true;
    };
  }, [token, session, sessionPending, joinViaInvite]);

  const handleGoToChat = () => {
    if (conversationId) {
      setActiveConversation(conversationId);
    }
    router.push("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        {state === "loading" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-500" />
            <p className="text-sm text-muted-foreground">
              Joining group...
            </p>
          </>
        )}

        {state === "auth_required" && (
          <>
            <XCircle className="mx-auto h-10 w-10 text-yellow-500" />
            <div className="space-y-2">
              <h1 className="text-lg font-semibold">Sign in required</h1>
              <p className="text-sm text-muted-foreground">
                You need to sign in to join this group.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => router.push(`/login?redirect=/join/${token}`)}
            >
              Sign In
            </Button>
          </>
        )}

        {state === "success" && (
          <>
            <CheckCircle className="mx-auto h-10 w-10 text-green-500" />
            <div className="space-y-2">
              <h1 className="text-lg font-semibold">Joined successfully</h1>
              <p className="text-sm text-muted-foreground">
                You have been added to the group.
              </p>
            </div>
            <Button className="w-full" onClick={handleGoToChat}>
              Go to Chat
            </Button>
          </>
        )}

        {state === "error" && (
          <>
            <XCircle className="mx-auto h-10 w-10 text-red-500" />
            <div className="space-y-2">
              <h1 className="text-lg font-semibold">Failed to join</h1>
              <p className="text-sm text-muted-foreground">
                {errorMessage || "The invite link may be invalid or expired."}
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push("/")}
            >
              Go Home
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
