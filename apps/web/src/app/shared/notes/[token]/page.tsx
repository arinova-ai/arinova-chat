"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { FileText, Loader2, AlertCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";

interface PublicNote {
  title: string;
  content: string;
  tags: string[];
  creatorType: string;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
}

export default function SharedNotePage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const [note, setNote] = useState<PublicNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api<PublicNote>(`/api/public/notes/${token}`, { silent: true })
      .then((data) => {
        setNote(data);
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

  if (notFound || !note) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertCircle className="h-10 w-10 opacity-50" />
        <p className="text-sm">This note is no longer available.</p>
      </div>
    );
  }

  const createdDate = new Date(note.createdAt).toLocaleDateString([], {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const updatedDate = new Date(note.updatedAt).toLocaleDateString([], {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          <span>{t("office.notes.publicNote")}</span>
        </div>
        <h1 className="text-xl font-bold leading-tight sm:text-2xl">{note.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{note.creatorName}</span>
          <span>&middot;</span>
          <span>{createdDate}</span>
          {createdDate !== updatedDate && (
            <>
              <span>&middot;</span>
              <span>Updated {updatedDate}</span>
            </>
          )}
        </div>
      </div>

      {/* Tags */}
      {note.tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[11px] font-medium text-brand-text"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown>{note.content || "*No content*"}</ReactMarkdown>
      </div>
    </div>
  );
}
