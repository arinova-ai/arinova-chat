"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useOfficeStream } from "@/hooks/use-office-stream";
import { KanbanBoard } from "@/components/kanban/kanban-board";

export default function OfficeTasksPage() {
  const stream = useOfficeStream();
  const searchParams = useSearchParams();
  const initialCardId = searchParams.get("card") ?? undefined;

  const streamAgentsList = useMemo(
    () => stream.agents.filter((a) => a.id && !a.id.startsWith("empty-")).map((a) => ({
      id: a.id,
      name: a.name,
      emoji: a.emoji,
    })),
    [stream.agents],
  );

  return <KanbanBoard mode="full" streamAgents={streamAgentsList} initialCardId={initialCardId} />;
}
