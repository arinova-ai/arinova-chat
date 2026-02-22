"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ResultPage() {
  const router = useRouter();

  useEffect(() => {
    // Results are shown inline on game page via GameOverDialog
    // Redirect back to home if someone navigates here directly
    router.push("/");
  }, [router]);

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
    </div>
  );
}
