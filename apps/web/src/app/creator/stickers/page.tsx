"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Upload,
  Send,
  X,
  Loader2,
  Sticker,
  Image as ImageIcon,
  Bot,
  Info,
} from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";

type PackStatus = "active" | "under_review" | "draft";
type ReviewStatus = "none" | "pending_review" | "approved" | "rejected";

interface StickerItem {
  id: string;
  filename: string;
  emoji: string;
  preview: string;
  agentPrompt?: string;
}

interface CreatorStickerPack {
  id: string;
  name: string;
  description: string;
  price: number;
  status: PackStatus;
  downloads: number;
  coverImage: string;
  stickers: StickerItem[];
  createdAt: string;
  agentCompatible?: boolean;
  reviewStatus?: ReviewStatus;
  reviewNote?: string;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function statusBadge(status: PackStatus, t: (k: string) => string) {
  const map: Record<PackStatus, { cls: string; label: string }> = {
    active: { cls: "bg-green-500/15 text-green-400", label: t("creator.stickers.statusActive") },
    under_review: { cls: "bg-blue-500/15 text-blue-400", label: t("creator.stickers.statusUnderReview") },
    draft: { cls: "bg-yellow-500/15 text-yellow-400", label: t("creator.stickers.statusDraft") },
  };
  return map[status];
}

function reviewStatusBadge(status: ReviewStatus, t: (k: string) => string): { cls: string; label: string } | null {
  const map: Record<ReviewStatus, { cls: string; label: string } | null> = {
    none: null,
    pending_review: { cls: "bg-yellow-500/15 text-yellow-400", label: t("creator.stickers.reviewPending") },
    approved: { cls: "bg-green-500/15 text-green-400", label: t("creator.stickers.reviewApproved") },
    rejected: { cls: "bg-red-500/15 text-red-400", label: t("creator.stickers.reviewRejected") },
  };
  return map[status];
}

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

type Filter = "all" | PackStatus;
const FILTER_KEYS: Filter[] = ["all", "active", "under_review", "draft"];

// ---------------------------------------------------------------------------
// Sticker Upload Preview
// ---------------------------------------------------------------------------

interface UploadedSticker {
  id: string;
  file: File;
  preview: string;
  emoji: string;
  agentPrompt?: string;
}

function StickerUploader({
  stickers,
  onAdd,
  onRemove,
  agentCompatible,
  onPromptChange,
}: {
  stickers: UploadedSticker[];
  onAdd: (files: FileList) => void;
  onRemove: (id: string) => void;
  agentCompatible?: boolean;
  onPromptChange?: (id: string, prompt: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {t("creator.stickers.stickersCount")} ({stickers.length})
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="gap-1"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          {t("common.upload")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onAdd(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {stickers.length > 0 ? (
        agentCompatible ? (
          <div className="space-y-3">
            {stickers.map((s) => (
              <div
                key={s.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-secondary/50 p-3"
              >
                <div className="group relative h-16 w-16 shrink-0 rounded-lg border border-border bg-secondary overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.preview}
                    alt={s.emoji}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => onRemove(s.id)}
                    className="absolute top-0.5 right-0.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("creator.stickers.agentPrompt")}
                  </label>
                  <input
                    type="text"
                    maxLength={200}
                    value={s.agentPrompt ?? ""}
                    onChange={(e) => onPromptChange?.(s.id, e.target.value)}
                    placeholder="Describe what this sticker means (e.g., 'User is greeting you cheerfully')"
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <p className="text-[10px] text-muted-foreground text-right">
                    {(s.agentPrompt ?? "").length}/200
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
            {stickers.map((s) => (
              <div
                key={s.id}
                className="group relative aspect-square rounded-lg border border-border bg-secondary overflow-hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.preview}
                  alt={s.emoji}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => onRemove(s.id)}
                  className="absolute top-0.5 right-0.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border py-8 text-muted-foreground">
          <ImageIcon className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">{t("creator.stickers.dropOrUpload")}</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground/60">
            Recommended: 256×256 px · PNG with transparent background
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit Dialog
// ---------------------------------------------------------------------------

function PackEditor({
  pack,
  onClose,
  onSave,
}: {
  pack: CreatorStickerPack | null; // null = create new
  onClose: () => void;
  onSave: (data: CreatorStickerPack) => void;
}) {
  const { t } = useTranslation();
  const isNew = !pack;
  const [name, setName] = useState(pack?.name ?? "");
  const [description, setDescription] = useState(pack?.description ?? "");
  const [price, setPrice] = useState(pack?.price?.toString() ?? "0");
  const [agentCompatible, setAgentCompatible] = useState(pack?.agentCompatible ?? false);
  const [saving, setSaving] = useState(false);
  const [uploadedStickers, setUploadedStickers] = useState<UploadedSticker[]>(
    () =>
      pack?.stickers.map((s) => ({
        id: s.id,
        file: null as unknown as File,
        preview: s.preview,
        emoji: s.emoji,
        agentPrompt: s.agentPrompt ?? "",
      })) ?? []
  );

  const handlePromptChange = useCallback((id: string, prompt: string) => {
    setUploadedStickers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, agentPrompt: prompt } : s))
    );
  }, []);

  // Validation for agent compatible packs
  const priceNum = parseInt(price) || 0;
  const agentPromptsValid = !agentCompatible || uploadedStickers.every((s) => (s.agentPrompt ?? "").trim().length > 0);
  const canSave = name.trim() && uploadedStickers.length > 0 && agentPromptsValid;

  const handleAddFiles = useCallback((files: FileList) => {
    const newStickers: UploadedSticker[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      newStickers.push({
        id: `upload-${Date.now()}-${i}`,
        file,
        preview: URL.createObjectURL(file),
        emoji: "😀",
      });
    }
    setUploadedStickers((prev) => [...prev, ...newStickers]);
  }, []);

  const handleRemoveSticker = useCallback((id: string) => {
    setUploadedStickers((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleSave = () => {
    if (!canSave) return;
    setSaving(true);
    // Simulate API call
    setTimeout(() => {
      const newPack: CreatorStickerPack = {
        id: pack?.id ?? `pack-${Date.now()}`,
        name: name.trim(),
        description: description.trim(),
        price: priceNum,
        status: pack?.status ?? "draft",
        downloads: pack?.downloads ?? 0,
        coverImage: uploadedStickers[0]?.preview ?? "",
        stickers: uploadedStickers.map((s, i) => ({
          id: s.id,
          filename: s.file?.name ?? `sticker_${i + 1}.webp`,
          emoji: s.emoji,
          preview: s.preview,
          agentPrompt: agentCompatible ? (s.agentPrompt ?? "") : undefined,
        })),
        createdAt: pack?.createdAt ?? new Date().toISOString().slice(0, 10),
        agentCompatible,
        reviewStatus: agentCompatible ? (pack?.reviewStatus ?? "none") : "none",
        reviewNote: pack?.reviewNote,
      };
      onSave(newPack);
      setSaving(false);
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {isNew ? t("creator.stickers.newPack") : t("creator.stickers.editPack")}
          </h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("creator.stickers.packName")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Sticker Pack"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("common.description")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("creator.stickers.descPlaceholder")}
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {/* Agent Compatible toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-brand-text" />
                <label className="text-sm font-medium">{t("creator.stickers.agentCompatible")}</label>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={agentCompatible}
                onClick={() => setAgentCompatible(!agentCompatible)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  agentCompatible ? "bg-brand" : "bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    agentCompatible ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            {agentCompatible && (
              <div className="flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2">
                <Info className="h-3.5 w-3.5 text-yellow-400 mt-0.5 shrink-0" />
                <p className="text-xs text-yellow-400">
                  {t("creator.stickers.agentReviewNote")}
                </p>
              </div>
            )}
          </div>

          {/* Price */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t("creator.stickers.price")}
            </label>
            <input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Sticker uploads */}
          <StickerUploader
            stickers={uploadedStickers}
            onAdd={handleAddFiles}
            onRemove={handleRemoveSticker}
            agentCompatible={agentCompatible}
            onPromptChange={handlePromptChange}
          />
          {agentCompatible && uploadedStickers.length > 0 && !agentPromptsValid && (
            <p className="text-xs text-red-400">
              {t("creator.stickers.agentPromptRequired")}
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            className="brand-gradient-btn flex-1"
            disabled={saving || !canSave}
            onClick={handleSave}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isNew ? (
              t("creator.stickers.createPack")
            ) : (
              t("common.save")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function StickerManagementContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [packs, setPacks] = useState<CreatorStickerPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<CreatorStickerPack | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api<{ packs: CreatorStickerPack[] }>("/api/creator/stickers")
      .then((data) => setPacks(data.packs))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? packs : packs.filter((p) => p.status === filter);

  const handleSave = (data: CreatorStickerPack) => {
    setPacks((prev) => {
      const idx = prev.findIndex((p) => p.id === data.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = data;
        return updated;
      }
      return [data, ...prev];
    });
    setEditorOpen(false);
    setEditingPack(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/api/creator/stickers/${id}`, { method: "DELETE" });
      setPacks((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // auto-handled
    }
  };

  const handleSubmitReview = async (id: string) => {
    const pack = packs.find((p) => p.id === id);
    setSubmitting(id);
    try {
      if (pack?.agentCompatible) {
        // Agent Compatible packs use the dedicated submit-review endpoint
        await api(`/api/creator/stickers/${id}/submit-review`, {
          method: "POST",
        });
        setPacks((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, status: "under_review" as PackStatus, reviewStatus: "pending_review" as ReviewStatus }
              : p
          )
        );
      } else {
        await api(`/api/creator/stickers/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "under_review" }),
        });
        setPacks((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, status: "under_review" as PackStatus } : p
          )
        );
      }
    } catch {
      // auto-handled
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center gap-3">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => router.push("/creator")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">{t("creator.stickers.title")}</h1>
              <p className="text-xs text-muted-foreground">
                {t("creator.stickers.subtitle")}
              </p>
            </div>
            <Button
              size="sm"
              className="brand-gradient-btn gap-1"
              onClick={() => {
                setEditingPack(null);
                setEditorOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("creator.stickers.newPack")}</span>
            </Button>
          </div>

          {/* Filter tabs */}
          <div className="mt-4 flex gap-1">
            {FILTER_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === key
                    ? "bg-brand/15 text-brand-text"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {t(`creator.stickers.filter.${key}`)}
                {key !== "all" && (
                  <span className="ml-1 opacity-60">
                    ({packs.filter((p) => p.status === key).length})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 md:pb-6">
          <div className="mx-auto max-w-4xl space-y-3">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Sticker className="h-12 w-12 text-muted-foreground opacity-30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {t("creator.stickers.noPacks")}
                </p>
              </div>
            ) : (
              filtered.map((pack) => {
                const badge = statusBadge(pack.status, t);
                return (
                  <div
                    key={pack.id}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex items-start gap-4">
                      {/* Cover */}
                      <div className="h-16 w-16 shrink-0 rounded-lg overflow-hidden bg-secondary">
                        {pack.coverImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={pack.coverImage}
                            alt={pack.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Sticker className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold truncate">
                            {pack.name}
                          </h3>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                          {pack.agentCompatible && (
                            <span className="shrink-0 rounded-full bg-brand/15 text-brand-text px-2 py-0.5 text-[10px] font-medium flex items-center gap-1">
                              <Bot className="h-3 w-3" />
                              AI
                            </span>
                          )}
                          {pack.agentCompatible && pack.reviewStatus && pack.reviewStatus !== "none" && (() => {
                            const rb = reviewStatusBadge(pack.reviewStatus, t);
                            return rb ? (
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${rb.cls}`}
                              >
                                {rb.label}
                              </span>
                            ) : null;
                          })()}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                          {pack.description}
                        </p>
                        {pack.reviewStatus === "rejected" && pack.reviewNote && (
                          <div className="mt-1 flex items-start gap-1.5 rounded-md bg-red-500/10 border border-red-500/20 px-2 py-1.5">
                            <Info className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />
                            <p className="text-[11px] text-red-400">
                              <span className="font-medium">{t("creator.stickers.reviewRejected")}:</span> {pack.reviewNote}
                            </p>
                          </div>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                          <span>{pack.stickers.length} {t("creator.stickers.stickersLabel")}</span>
                          <span>
                            {pack.price === 0
                              ? t("common.free")
                              : `${pack.price} ${t("creator.stickers.coins")}`}
                          </span>
                          {pack.downloads > 0 && (
                            <span>
                              {pack.downloads.toLocaleString()} {t("creator.stickers.downloads")}
                            </span>
                          )}
                          <span>{pack.createdAt}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {(pack.status === "draft" || (pack.agentCompatible && pack.reviewStatus === "rejected")) && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="gap-1 text-blue-400 hover:text-blue-300"
                            disabled={submitting === pack.id}
                            onClick={() => handleSubmitReview(pack.id)}
                          >
                            {submitting === pack.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                <Send className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">
                                  {pack.reviewStatus === "rejected" ? t("creator.stickers.resubmit") : t("creator.stickers.submit")}
                                </span>
                              </>
                            )}
                          </Button>
                        )}
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          onClick={() => {
                            setEditingPack(pack);
                            setEditorOpen(true);
                          }}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => handleDelete(pack.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Sticker thumbnails */}
                    <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
                      {pack.stickers.slice(0, 8).map((s) => (
                        <div
                          key={s.id}
                          className="h-10 w-10 shrink-0 rounded-md bg-secondary overflow-hidden"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={s.preview}
                            alt={s.emoji}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ))}
                      {pack.stickers.length > 8 && (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-[10px] text-muted-foreground">
                          +{pack.stickers.length - 8}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <MobileBottomNav />
      </div>

      {/* Editor dialog */}
      {editorOpen && (
        <PackEditor
          pack={editingPack}
          onClose={() => {
            setEditorOpen(false);
            setEditingPack(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

export default function StickerManagementPage() {
  return (
    <AuthGuard>
      <StickerManagementContent />
    </AuthGuard>
  );
}
