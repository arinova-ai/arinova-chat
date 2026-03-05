"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { api, ApiError } from "@/lib/api";
import { useToastStore } from "@/store/toast-store";
import { ArinovaSpinner } from "@/components/ui/arinova-spinner";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { PageTitle } from "@/components/ui/page-title";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Search,
  Sticker,
  Download,
  ChevronLeft,
  ChevronRight,
  Gift,
  Share2,
  Loader2,
  X,
  Bot,
  Sparkles,
} from "lucide-react";
import { assetUrl } from "@/lib/config";
import { useTranslation } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StickerPack {
  id: string;
  dir: string; // directory name under /stickers/ (derived from coverImage)
  name: string;
  author: string;
  price: number;
  downloads: number;
  category: string;
  stickers: number;
  coverUrl: string;
  stickerFiles?: ApiSticker[];
  agentCompatible: boolean;
  reviewStatus: string;
}

interface ApiPack {
  id: string;
  creatorName: string | null;
  name: string;
  nameZh: string | null;
  category: string;
  price: number;
  downloads: number;
  coverImage: string | null;
  stickerCount: number;
  stickers?: ApiSticker[];
  agentCompatible?: boolean;
  reviewStatus?: string;
}

interface ApiSticker {
  id: string;
  filename: string;
  emoji: string | null;
  sortOrder: number;
  agentPrompt?: string | null;
}

function packDirFromCover(coverImage: string | null): string {
  // Extract directory name: "/stickers/pixel-cat-01/01-hello.png" -> "pixel-cat-01"
  if (!coverImage) return "arinova-pack-01";
  const parts = coverImage.split("/");
  return parts.length >= 3 ? parts[parts.length - 2] : "arinova-pack-01";
}

function apiPackToStickerPack(p: ApiPack): StickerPack {
  return {
    id: p.id,
    dir: packDirFromCover(p.coverImage),
    name: p.name,
    author: p.creatorName ?? "Unknown",
    price: p.price,
    downloads: p.downloads,
    category: p.category,
    stickers: p.stickerCount,
    coverUrl: p.coverImage ?? "/stickers/arinova-pack-01/01-hello.png",
    stickerFiles: p.stickers,
    agentCompatible: p.agentCompatible ?? false,
    reviewStatus: p.reviewStatus ?? "none",
  };
}

type StickerFilter = "all" | "free" | "agent-compatible";

const CATEGORY_KEYS = ["all", "cute", "funny", "anime", "meme", "seasonal"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

interface GiftFriend {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
}

// ---------------------------------------------------------------------------
// Featured Carousel
// ---------------------------------------------------------------------------

function FeaturedCarousel({ packs, t }: { packs: StickerPack[]; t: (k: string) => string }) {
  const [idx, setIdx] = useState(0);

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-brand/20 to-blue-600/10 border border-brand/20">
      {/* Sliding container */}
      <div
        className="flex transition-transform duration-400 ease-in-out"
        style={{ transform: `translateX(-${idx * 100}%)` }}
      >
        {packs.map((pack) => (
          <div key={pack.id} className="w-full shrink-0 p-5 md:p-6">
            <div className="flex items-center gap-4">
              <img
                src={pack.coverUrl}
                alt={pack.name}
                className="h-16 w-16 md:h-20 md:w-20 shrink-0 rounded-lg object-contain bg-white/5 p-1"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-brand-text uppercase tracking-wide">{t("stickerShop.featured")}</p>
                <h3 className="mt-0.5 text-lg font-bold truncate">{pack.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {pack.author} &middot; {pack.stickers} {t("stickerShop.stickersCount")}
                </p>
                <div className="mt-2">
                  <PriceBadge price={pack.price} t={t} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {packs.length > 1 && (
        <>
          <button
            onClick={() => setIdx((i) => (i - 1 + packs.length) % packs.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/60 p-1 text-foreground hover:bg-background/80 z-10"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIdx((i) => (i + 1) % packs.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/60 p-1 text-foreground hover:bg-background/80 z-10"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {packs.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === idx ? "w-4 bg-brand" : "w-1.5 bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Price Badge
// ---------------------------------------------------------------------------

function PriceBadge({ price, t }: { price: number; t: (k: string) => string }) {
  if (price === 0) {
    return (
      <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-400">
        {t("stickerShop.free")}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[11px] font-medium text-yellow-400">
      {price} {t("stickerShop.coins")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pack Card
// ---------------------------------------------------------------------------

function AiBadge() {
  return (
    <span className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 rounded-md bg-gradient-to-r from-blue-500 to-purple-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
      <Sparkles className="h-2.5 w-2.5" />
      AI
    </span>
  );
}

function PackCard({ pack, onClick, onGift, onShare, t }: { pack: StickerPack; onClick: () => void; onGift: () => void; onShare: () => void; t: (k: string) => string }) {
  const isFree = !pack.agentCompatible && pack.price === 0;

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-brand-border">
      <button onClick={onClick} className="relative flex aspect-square w-full items-center justify-center rounded-lg bg-secondary/50 p-3">
        {pack.agentCompatible && <AiBadge />}
        <img
          src={pack.coverUrl}
          alt={pack.name}
          className="h-full w-full object-contain"
        />
      </button>
      <h3 className="mt-2.5 text-sm font-semibold truncate cursor-pointer" onClick={onClick}>{pack.name}</h3>
      <p className="text-[11px] text-muted-foreground truncate">{pack.author}</p>
      <div className="mt-2 flex items-center gap-2">
        <PriceBadge price={pack.price} t={t} />
        {isFree ? (
          <button
            onClick={(e) => { e.stopPropagation(); onShare(); }}
            className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-brand-text"
            title={t("stickerShop.share")}
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onGift(); }}
            className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-brand-text"
            title={t("stickerShop.gift")}
          >
            <Gift className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
          <Download className="h-3 w-3" />
          {formatCount(pack.downloads)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pack Detail Dialog
// ---------------------------------------------------------------------------

const STICKER_NAMES: Record<string, string[]> = {
  "arinova-official": [
    "hello", "thumbsup", "love", "happy", "sad", "angry", "surprised",
    "thinking", "sleepy", "celebrate", "fighting", "please", "ok",
    "awkward", "hug", "sparkle", "busy", "coffee", "goodnight", "amazing",
  ],
  "lobster-pack-01": [
    "happy-wave", "laughing", "angry", "crying", "love", "sleeping", "thumbsup",
    "surprised", "cool", "shy", "eating", "thinking", "celebrate",
    "scared", "heart", "dancing", "sick", "bow", "strong", "bye",
  ],
  "cat-pack-01": [
    "happy-wave", "laughing", "angry", "crying", "love", "sleeping", "thumbsup",
    "surprised", "cool", "shy", "eating", "thinking", "celebrate",
    "scared", "heart", "dancing", "sick", "bow", "strong", "bye",
  ],
};

function getStickerFiles(packId: string, count: number): string[] {
  const names = STICKER_NAMES[packId];
  if (names) {
    const dir = packId === "arinova-official" ? "arinova-pack-01" : packId;
    return names.slice(0, count).map((name, i) => {
      const num = String(i + 1).padStart(2, "0");
      return `/stickers/${dir}/${num}-${name}.png`;
    });
  }
  // Fallback: use arinova-pack-01 placeholder
  return Array.from({ length: Math.min(count, 20) }, (_, i) => {
    const num = String(i + 1).padStart(2, "0");
    const fallbackNames = [
      "hello", "thumbsup", "love", "happy", "sad", "angry", "surprised",
      "thinking", "sleepy", "celebrate", "fighting", "please", "ok",
      "awkward", "hug", "sparkle", "busy", "coffee", "goodnight", "amazing",
    ];
    return `/stickers/arinova-pack-01/${num}-${fallbackNames[i]}.png`;
  });
}

function PackDetailDialog({
  pack,
  open,
  onClose,
  onGift,
  onShare,
  t,
}: {
  pack: StickerPack | null;
  open: boolean;
  onClose: () => void;
  onGift: (pack: StickerPack) => void;
  onShare: (pack: StickerPack) => void;
  t: (k: string) => string;
}) {
  const [detailStickers, setDetailStickers] = useState<string[]>([]);
  const [detailStickerData, setDetailStickerData] = useState<ApiSticker[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [zoomedSticker, setZoomedSticker] = useState<string | null>(null);
  const [expandedPromptIdx, setExpandedPromptIdx] = useState<number | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchased, setPurchased] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");

  const handlePurchase = async () => {
    if (!pack) return;
    setPurchasing(true);
    setPurchaseError("");
    try {
      await api(`/api/stickers/${pack.id}/purchase`, { method: "POST" });
      setPurchased(true);
    } catch (err) {
      setPurchaseError(
        err instanceof Error ? err.message : t("stickerShop.purchaseFailed")
      );
    } finally {
      setPurchasing(false);
    }
  };

  // Reset purchase state when dialog opens for a different pack
  useEffect(() => {
    setPurchased(false);
    setPurchaseError("");
  }, [pack?.id]);

  useEffect(() => {
    if (!zoomedSticker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        setZoomedSticker(null);
      }
    };
    // Use capture phase to intercept before Radix Dialog
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [zoomedSticker]);

  useEffect(() => {
    if (!open) setZoomedSticker(null);
  }, [open]);

  useEffect(() => {
    if (!pack || !open) return;
    setExpandedPromptIdx(null);
    // If pack has inline sticker files from API, build URLs
    if (pack.stickerFiles && pack.stickerFiles.length > 0) {
      setDetailStickers(pack.stickerFiles.map((s) => `/stickers/${pack.dir}/${s.filename}`));
      setDetailStickerData(pack.stickerFiles);
      return;
    }
    // Otherwise fetch from API
    setDetailLoading(true);
    api<{ stickers: ApiSticker[] }>(`/api/stickers/${pack.id}`)
      .then((data) => {
        setDetailStickers(data.stickers.map((s) => `/stickers/${pack.dir}/${s.filename}`));
        setDetailStickerData(data.stickers);
      })
      .catch(() => {
        // Fallback to legacy file naming
        setDetailStickers(getStickerFiles(pack.id, pack.stickers));
        setDetailStickerData([]);
      })
      .finally(() => setDetailLoading(false));
  }, [pack, open]);

  if (!pack) return null;

  const previewStickers = detailStickers.length > 0 ? detailStickers : getStickerFiles(pack.id, pack.stickers);

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v && !zoomedSticker) onClose(); }}>
      <DialogContent className="max-w-lg border-border bg-card p-0 gap-0">
        {/* Banner */}
        <div className="relative bg-gradient-to-r from-brand/20 to-blue-600/10 p-5">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              {pack.name}
              {pack.agentCompatible && (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-gradient-to-r from-blue-500 to-purple-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  <Sparkles className="h-2.5 w-2.5" />
                  AI
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {pack.author} &middot; {pack.stickers} {t("stickerShop.stickersCount")}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 flex items-center gap-3">
            <PriceBadge price={pack.price} t={t} />
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <Download className="h-3 w-3" />
              {formatCount(pack.downloads)}
            </span>
          </div>
          {purchaseError && (
            <p className="mt-2 text-xs text-destructive">{purchaseError}</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              className="brand-gradient-btn gap-1"
              disabled={purchasing || purchased}
              onClick={handlePurchase}
            >
              {purchasing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {purchased
                ? t("stickerShop.downloaded")
                : pack.price === 0
                  ? t("stickerShop.download")
                  : `${t("stickerShop.buyFor")} ${pack.price} ${t("stickerShop.coins")}`}
            </Button>
            {!pack.agentCompatible && pack.price === 0 ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                title={t("stickerShop.share")}
                onClick={() => onShare(pack)}
              >
                <Share2 className="h-3.5 w-3.5" />
                {t("stickerShop.share")}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                title={t("stickerShop.gift")}
                onClick={() => onGift(pack)}
              >
                <Gift className="h-3.5 w-3.5" />
                {t("stickerShop.gift")}
              </Button>
            )}
          </div>
        </div>

        {/* Agent Compatible — "Try it" demo + explanation */}
        {pack.agentCompatible && (
          <div className="border-b border-border px-4 py-3 space-y-3">
            {/* Explanation text */}
            <div className="flex items-start gap-2 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 p-3">
              <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-blue-400" />
              <p className="text-xs text-muted-foreground">
                {t("stickerShop.agentCompatibleDesc")}
              </p>
            </div>

            {/* "Try it" demo — static chat simulation */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                {t("stickerShop.tryItDemo")}
              </p>
              <div className="rounded-lg bg-secondary/30 p-3 space-y-2">
                {/* User sends sticker (right-aligned) */}
                <div className="flex justify-end">
                  <div className="rounded-xl bg-brand/15 p-1.5">
                    <img
                      src={previewStickers[0] ?? pack.coverUrl}
                      alt="demo sticker"
                      className="h-14 w-14 object-contain"
                    />
                  </div>
                </div>
                {/* Agent responds (left-aligned) */}
                <div className="flex items-start gap-2">
                  <div className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500">
                    <Bot className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="rounded-xl bg-secondary px-3 py-2 text-xs text-foreground max-w-[80%]">
                    {t("stickerShop.tryItResponse")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sticker grid */}
        <div className="grid grid-cols-4 gap-2 p-4 sm:grid-cols-5 max-h-[50vh] overflow-y-auto">
          {previewStickers.map((url, i) => {
            const stickerData = detailStickerData[i];
            const agentPrompt = stickerData?.agentPrompt;
            const isExpanded = expandedPromptIdx === i;
            const truncatedPrompt = agentPrompt && agentPrompt.length > 50
              ? agentPrompt.slice(0, 50) + "..."
              : agentPrompt;

            return (
              <div key={i} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => {
                    if (pack.agentCompatible && agentPrompt) {
                      setExpandedPromptIdx(isExpanded ? null : i);
                    } else {
                      setZoomedSticker(url);
                    }
                  }}
                  className="flex aspect-square items-center justify-center rounded-lg bg-secondary/50 p-2 cursor-zoom-in hover:bg-secondary/80 transition-colors"
                >
                  <img src={url} alt={`sticker-${i + 1}`} className="h-full w-full object-contain" />
                </button>
                {pack.agentCompatible && agentPrompt && (
                  <p
                    className="mt-1 text-[10px] text-muted-foreground leading-tight cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => setExpandedPromptIdx(isExpanded ? null : i)}
                    title={agentPrompt}
                  >
                    {isExpanded ? agentPrompt : truncatedPrompt}
                  </p>
                )}
              </div>
            );
          })}
        </div>

      </DialogContent>
    </Dialog>

    {/* Sticker lightbox — rendered outside Dialog to avoid Radix focus trap */}
    {zoomedSticker &&
      createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          style={{ pointerEvents: "auto" }}
          onClick={() => setZoomedSticker(null)}
        >
          <button
            className="absolute right-4 rounded-full bg-card/80 p-3 text-white hover:bg-accent transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            style={{ top: "max(1rem, env(safe-area-inset-top, 1rem))" }}
            onClick={(e) => { e.stopPropagation(); setZoomedSticker(null); }}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={zoomedSticker}
            alt="sticker preview"
            className="max-h-[80vh] max-w-[80vw] object-contain animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body,
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Gift Dialog
// ---------------------------------------------------------------------------

function GiftDialog({
  pack,
  open,
  onClose,
  t,
}: {
  pack: StickerPack | null;
  open: boolean;
  onClose: () => void;
  t: (k: string) => string;
}) {
  const addToast = useToastStore((s) => s.addToast);
  const [friends, setFriends] = useState<GiftFriend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  // Fetch real friend list when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFriendsLoading(true);
    setFriendsError(false);
    api<GiftFriend[]>("/api/friends")
      .then((data) => { if (!cancelled) setFriends(data); })
      .catch(() => { if (!cancelled) { setFriends([]); setFriendsError(true); } })
      .finally(() => { if (!cancelled) setFriendsLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  const handleSend = async () => {
    if (!selectedFriend || !pack) return;
    try {
      await api(`/api/stickers/${pack.id}/gift`, {
        method: "POST",
        body: JSON.stringify({ friendId: selectedFriend, message: message || undefined }),
      });
      setSent(true);
      setTimeout(() => {
        setSent(false);
        setSelectedFriend(null);
        setMessage("");
        onClose();
      }, 1500);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        addToast(t("stickerShop.recipientAlreadyOwns"), "error");
      } else {
        addToast(t("stickerShop.giftFailed"), "error");
      }
    }
  };

  const handleClose = () => {
    setSelectedFriend(null);
    setMessage("");
    setSent(false);
    onClose();
  };

  if (!pack) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-brand-text" />
            {t("stickerShop.giftTitle")}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Send &ldquo;{pack.name}&rdquo; to a friend
            {pack.price > 0 && ` for ${pack.price} ${t("stickerShop.coins")}`}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <span className="text-3xl">🎉</span>
            <p className="text-sm font-medium text-green-400">{t("stickerShop.giftSent")}</p>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {/* Friend selection */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">{t("stickerShop.chooseFriend")}</label>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {friendsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : friendsError ? (
                  <p className="py-4 text-center text-xs text-destructive">
                    {t("stickerShop.friendsError")}
                  </p>
                ) : friends.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    {t("stickerShop.noFriends")}
                  </p>
                ) : (
                  friends.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFriend(f.id)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                        selectedFriend === f.id
                          ? "bg-brand/15 ring-1 ring-brand/40"
                          : "hover:bg-secondary"
                      }`}
                    >
                      <Avatar className="h-8 w-8">
                        {f.image ? (
                          <AvatarImage src={assetUrl(f.image)} alt={f.name ?? f.username ?? ""} />
                        ) : null}
                        <AvatarFallback className="text-xs">
                          {(f.name ?? f.username ?? "?").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm truncate block">{f.name ?? f.username}</span>
                        {f.username && (
                          <span className="text-[11px] text-muted-foreground truncate block">@{f.username}</span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Optional message */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">{t("stickerShop.messageOptional")}</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={200}
                placeholder={t("stickerShop.messagePlaceholder")}
                className="min-h-[60px] w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            {/* Send button */}
            <Button
              onClick={handleSend}
              disabled={!selectedFriend}
              className="brand-gradient-btn w-full gap-1.5"
            >
              <Gift className="h-4 w-4" />
              {t("stickerShop.sendGift")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function StickerShopContent() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [stickerFilter, setStickerFilter] = useState<StickerFilter>("all");
  const [selectedPack, setSelectedPack] = useState<StickerPack | null>(null);
  const [giftPack, setGiftPack] = useState<StickerPack | null>(null);
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [loading, setLoading] = useState(true);

  const handleShare = useCallback((pack: StickerPack) => {
    const url = `${window.location.origin}/stickers?pack=${pack.id}`;
    if (navigator.share) {
      navigator.share({ title: pack.name, text: `Check out "${pack.name}" stickers on Arinova!`, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        // Simple feedback — could enhance with a toast
        alert(t("stickerShop.linkCopied"));
      }).catch(() => {});
    }
  }, [t]);

  const fetchPacks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ packs: ApiPack[] }>("/api/stickers");
      setPacks(data.packs.map(apiPackToStickerPack));
    } catch {
      // auto-handled
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPacks();
  }, [fetchPacks]);

  const featuredPacks = useMemo(() => packs.slice(0, 3), [packs]);

  const filtered = useMemo(() => {
    let list = packs;
    // Apply sticker type filter
    if (stickerFilter === "free") {
      list = list.filter((p) => !p.agentCompatible);
    } else if (stickerFilter === "agent-compatible") {
      list = list.filter((p) => p.agentCompatible);
    }
    if (category !== "all") {
      list = list.filter((p) => p.category === category);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.author.toLowerCase().includes(q),
      );
    }
    return list;
  }, [packs, category, stickerFilter, search]);

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-5">
          <div className="flex items-center gap-4">
            <PageTitle title={t("stickerShop.title")} subtitle={t("stickerShop.subtitle")} icon={Sticker} />
          </div>

          {/* Search */}
          <div className="mt-3 relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder={t("stickerShop.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border-none bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Filter tabs: All | Free | Agent Compatible */}
          <div className="mt-3 flex border-b border-border">
            {([
              { key: "all" as StickerFilter, label: t("stickerShop.filterAll") },
              { key: "free" as StickerFilter, label: t("stickerShop.filterFree") },
              { key: "agent-compatible" as StickerFilter, label: t("stickerShop.filterAgentCompatible"), icon: true },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStickerFilter(tab.key)}
                className={`flex items-center gap-1 px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  stickerFilter === tab.key
                    ? "border-brand text-brand-text"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                }`}
              >
                {tab.icon && <Sparkles className="h-3 w-3" />}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Category pills */}
          <div className="mt-3 flex flex-wrap gap-2">
            {CATEGORY_KEYS.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  category === cat
                    ? "bg-brand text-white"
                    : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {t(`stickerShop.cat.${cat}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:p-6 md:pb-6">
          <div className="mx-auto max-w-5xl space-y-6">
            {/* Featured carousel */}
            {featuredPacks.length > 0 && <FeaturedCarousel packs={featuredPacks} t={t} />}

            {/* Grid */}
            {loading ? (
              <div className="flex h-40 items-center justify-center">
                <ArinovaSpinner size="sm" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Sticker className="h-10 w-10 opacity-40 mb-2" />
                <p className="text-sm">{t("stickerShop.noPacks")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((pack) => (
                  <PackCard
                    key={pack.id}
                    pack={pack}
                    onClick={() => setSelectedPack(pack)}
                    onGift={() => setGiftPack(pack)}
                    onShare={() => handleShare(pack)}
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <MobileBottomNav />
      </div>

      <PackDetailDialog
        pack={selectedPack}
        open={selectedPack !== null}
        onClose={() => setSelectedPack(null)}
        onGift={(p) => { setSelectedPack(null); setGiftPack(p); }}
        onShare={(p) => { setSelectedPack(null); handleShare(p); }}
        t={t}
      />

      <GiftDialog
        pack={giftPack}
        open={giftPack !== null}
        onClose={() => setGiftPack(null)}
        t={t}
      />
    </div>
  );
}

export default function StickerShopPage() {
  return (
    <AuthGuard>
      <StickerShopContent />
    </AuthGuard>
  );
}
