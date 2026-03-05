"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Sparkles,
  User,
  Clock,
  DollarSign,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiSticker {
  id: string;
  packId: string;
  filename: string;
  emoji: string | null;
  agentPrompt: string | null;
  sortOrder: number;
}

interface PendingPack {
  id: string;
  creatorId: string;
  creatorName: string | null;
  name: string;
  nameZh: string | null;
  category: string;
  price: number;
  coverImage: string | null;
  agentCompatible: boolean;
  reviewStatus: string;
  stickerCount: number;
  stickers: ApiSticker[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function packDir(coverImage: string | null): string {
  if (!coverImage) return "arinova-pack-01";
  const parts = coverImage.split("/");
  return parts.length >= 3 ? parts[parts.length - 2] : "arinova-pack-01";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function StickerReviewContent() {
  const [packs, setPacks] = useState<PendingPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Dialog state
  const [actionPack, setActionPack] = useState<PendingPack | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [notes, setNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Expanded pack
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchPacks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ packs: PendingPack[] }>("/api/admin/stickers/pending");
      setPacks(data.packs);
    } catch {
      setError("Failed to load pending sticker packs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPacks();
  }, [fetchPacks]);

  const handleAction = async () => {
    if (!actionPack || !actionType) return;
    if (actionType === "reject" && !notes.trim()) return;

    setActionLoading(true);
    try {
      await api(`/api/admin/stickers/${actionPack.id}/review`, {
        method: "POST",
        body: JSON.stringify({
          action: actionType,
          note: notes.trim() || undefined,
        }),
      });
      setPacks((prev) => prev.filter((p) => p.id !== actionPack.id));
      closeDialog();
    } catch {
      // api() auto-toasts errors
    } finally {
      setActionLoading(false);
    }
  };

  const openDialog = (pack: PendingPack, type: "approve" | "reject") => {
    setActionPack(pack);
    setActionType(type);
    setNotes("");
  };

  const closeDialog = () => {
    setActionPack(null);
    setActionType(null);
    setNotes("");
  };

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-blue-400" />
            <h2 className="text-xl font-bold text-foreground">Sticker Review</h2>
          </div>
          <span className="rounded-full bg-orange-500/20 px-3 py-1 text-sm font-medium text-orange-400">
            {packs.length} pending
          </span>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && packs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <CheckCircle className="mb-4 h-12 w-12" />
            <p className="text-lg font-medium">All clear</p>
            <p className="text-sm">No sticker packs pending review.</p>
          </div>
        )}

        {/* Pack list */}
        <div className="space-y-4">
          {packs.map((pack) => {
            const dir = packDir(pack.coverImage);
            const isExpanded = expandedId === pack.id;

            return (
              <div
                key={pack.id}
                className="rounded-lg border border-border bg-card overflow-hidden"
              >
                {/* Summary row */}
                <button
                  type="button"
                  className="w-full p-4 text-left hover:bg-accent/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : pack.id)}
                >
                  <div className="flex items-start gap-4">
                    {/* Cover image */}
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-secondary/50 p-1">
                      {pack.coverImage ? (
                        <img
                          src={pack.coverImage}
                          alt={pack.name}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <Sparkles className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold truncate">{pack.name}</h3>
                        {pack.nameZh && (
                          <span className="text-sm text-muted-foreground truncate">
                            ({pack.nameZh})
                          </span>
                        )}
                        <span className="shrink-0 rounded bg-gradient-to-r from-blue-500/20 to-purple-500/20 px-2 py-0.5 text-xs font-medium text-blue-400">
                          AI Compatible
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {pack.creatorName ?? "Unknown"}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {pack.price} coins
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(pack.updatedAt).toLocaleDateString()}
                        </span>
                        <span className="rounded bg-neutral-700 px-1.5 py-0.5">
                          {pack.category}
                        </span>
                        <span className="rounded bg-neutral-700 px-1.5 py-0.5">
                          {pack.stickers.length} stickers
                        </span>
                      </div>
                    </div>
                  </div>
                </button>

                {/* Expanded detail — sticker grid with agent prompts */}
                {isExpanded && (
                  <div className="border-t border-border p-4 space-y-4">
                    {/* Review checklist reminder */}
                    <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2">
                      <p className="text-xs text-orange-400">
                        Review each sticker's agent_prompt for: prompt injection attempts,
                        inappropriate content, and prompt-visual mismatch.
                      </p>
                    </div>

                    {/* Sticker grid */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {pack.stickers.map((sticker) => (
                        <div
                          key={sticker.id}
                          className="rounded-lg border border-border bg-secondary/30 p-2"
                        >
                          <div className="flex aspect-square items-center justify-center rounded-md bg-secondary/50 p-2">
                            <img
                              src={`/stickers/${dir}/${sticker.filename}`}
                              alt={sticker.filename}
                              className="h-full w-full object-contain"
                            />
                          </div>
                          <div className="mt-2 space-y-1">
                            <p className="text-[10px] text-muted-foreground truncate">
                              {sticker.filename}
                            </p>
                            {sticker.agentPrompt ? (
                              <p className="text-xs text-foreground bg-neutral-800 rounded px-2 py-1.5 leading-relaxed">
                                {sticker.agentPrompt}
                              </p>
                            ) : (
                              <p className="text-xs text-destructive italic">
                                Missing agent_prompt
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-3 pt-2">
                      <Button
                        className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => openDialog(pack, "approve")}
                      >
                        <CheckCircle className="h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        className="gap-2"
                        onClick={() => openDialog(pack, "reject")}
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Approve / Reject Dialog */}
      <Dialog open={!!actionPack} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "approve" ? "Approve Sticker Pack" : "Reject Sticker Pack"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "approve"
                ? `"${actionPack?.name}" will be published to the Sticker Shop.`
                : `"${actionPack?.name}" will be rejected. A reason is required.`}
            </DialogDescription>
          </DialogHeader>

          <Textarea
            placeholder={
              actionType === "approve"
                ? "Optional approval notes..."
                : "Rejection reason (required)..."
            }
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="bg-neutral-800 border-none"
          />

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              className={
                actionType === "approve"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : ""
              }
              variant={actionType === "reject" ? "destructive" : "default"}
              disabled={
                actionLoading ||
                (actionType === "reject" && !notes.trim())
              }
              onClick={handleAction}
            >
              {actionLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {actionType === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminStickerReviewPage() {
  return <StickerReviewContent />;
}
