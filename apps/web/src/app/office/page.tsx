"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OfficeView } from "@/components/office/office-view";

function OfficeSceneContent() {
  const searchParams = useSearchParams();
  const visitUserId = searchParams.get("visit") ?? undefined;

  return (
    <div className="h-full p-3 md:p-4">
      <OfficeView visitUserId={visitUserId} />
    </div>
  );
}

export default function OfficeScenePage() {
  return (
    <Suspense>
      <OfficeSceneContent />
    </Suspense>
  );
}
