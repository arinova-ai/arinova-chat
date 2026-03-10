"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { Loader2, AlertCircle, LayoutList } from "lucide-react";
import { api, ApiError } from "@/lib/api";

interface PublicCard {
  title: string;
  description: string | null;
  priority: string | null;
  columnName: string;
  createdAt: string | null;
  updatedAt: string | null;
}

const PRIORITY_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: "Low", color: "text-slate-400", bg: "bg-slate-500/15" },
  medium: { label: "Medium", color: "text-blue-400", bg: "bg-blue-500/15" },
  high: { label: "High", color: "text-orange-400", bg: "bg-orange-500/15" },
  urgent: { label: "Urgent", color: "text-red-400", bg: "bg-red-500/15" },
};

export default function SharedCardPage() {
  const { token } = useParams<{ token: string }>();
  const [card, setCard] = useState<PublicCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api<PublicCard>(`/api/public/cards/${token}`, { silent: true })
      .then((data) => {
        setCard(data);
        setNotFound(false);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !card) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertCircle className="h-10 w-10 opacity-50" />
        <p className="text-sm">This card is no longer available.</p>
      </div>
    );
  }

  const p = card.priority ?? "medium";
  const pCfg = PRIORITY_STYLES[p] ?? PRIORITY_STYLES.medium;

  const createdDate = card.createdAt
    ? new Date(card.createdAt).toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" })
    : null;
  const updatedDate = card.updatedAt
    ? new Date(card.updatedAt).toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <LayoutList className="h-3.5 w-3.5" />
          <span>Shared Card</span>
        </div>
        <h1 className="text-xl font-bold leading-tight sm:text-2xl">{card.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${pCfg.color} ${pCfg.bg}`}>
            {pCfg.label}
          </span>
          <span>&middot;</span>
          <span>{card.columnName}</span>
          {createdDate && (
            <>
              <span>&middot;</span>
              <span>{createdDate}</span>
            </>
          )}
          {updatedDate && createdDate !== updatedDate && (
            <>
              <span>&middot;</span>
              <span>Updated {updatedDate}</span>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      {card.description ? (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{card.description}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No description.</p>
      )}
    </div>
  );
}
