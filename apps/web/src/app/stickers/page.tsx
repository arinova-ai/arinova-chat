"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { ArinovaSpinner } from "@/components/ui/arinova-spinner";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { PageTitle } from "@/components/ui/page-title";
import { Button } from "@/components/ui/button";
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
  X,
} from "lucide-react";
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
}

interface ApiSticker {
  id: string;
  filename: string;
  emoji: string | null;
  sortOrder: number;
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
  };
}

const CATEGORY_KEYS = ["all", "cute", "funny", "anime", "meme", "seasonal"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// Mock friends for gift feature
const MOCK_FRIENDS = [
  { id: "f1", name: "Alice", avatar: "A" },
  { id: "f2", name: "Bob", avatar: "B" },
  { id: "f3", name: "Charlie", avatar: "C" },
  { id: "f4", name: "Diana", avatar: "D" },
];

// ---------------------------------------------------------------------------
// Featured Carousel
// ---------------------------------------------------------------------------

function FeaturedCarousel({ packs, t }: { packs: StickerPack[]; t: (k: string) => string }) {
  const [idx, setIdx] = useState(0);
  const pack = packs[idx];

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-brand/20 to-blue-600/10 border border-brand/20 p-5 md:p-6">
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
      {packs.length > 1 && (
        <>
          <button
            onClick={() => setIdx((i) => (i - 1 + packs.length) % packs.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/60 p-1 text-foreground hover:bg-background/80"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIdx((i) => (i + 1) % packs.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/60 p-1 text-foreground hover:bg-background/80"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {packs.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === idx ? "bg-brand" : "bg-muted-foreground/30"
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

function PackCard({ pack, onClick, onGift, t }: { pack: StickerPack; onClick: () => void; onGift: () => void; t: (k: string) => string }) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-brand-border">
      <button onClick={onClick} className="flex aspect-square w-full items-center justify-center rounded-lg bg-secondary/50 p-3">
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
        <button
          onClick={(e) => { e.stopPropagation(); onGift(); }}
          className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-brand-text"
          title={t("stickerShop.gift")}
        >
          <Gift className="h-3.5 w-3.5" />
        </button>
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
  t,
}: {
  pack: StickerPack | null;
  open: boolean;
  onClose: () => void;
  onGift: (pack: StickerPack) => void;
  t: (k: string) => string;
}) {
  const [detailStickers, setDetailStickers] = useState<string[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [zoomedSticker, setZoomedSticker] = useState<string | null>(null);

  useEffect(() => {
    if (!zoomedSticker) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoomedSticker(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoomedSticker]);

  useEffect(() => {
    if (!open) setZoomedSticker(null);
  }, [open]);

  useEffect(() => {
    if (!pack || !open) return;
    // If pack has inline sticker files from API, build URLs
    if (pack.stickerFiles && pack.stickerFiles.length > 0) {
      setDetailStickers(pack.stickerFiles.map((s) => `/stickers/${pack.dir}/${s.filename}`));
      return;
    }
    // Otherwise fetch from API
    setDetailLoading(true);
    api<{ stickers: ApiSticker[] }>(`/api/stickers/${pack.id}`)
      .then((data) => {
        setDetailStickers(data.stickers.map((s) => `/stickers/${pack.dir}/${s.filename}`));
      })
      .catch(() => {
        // Fallback to legacy file naming
        setDetailStickers(getStickerFiles(pack.id, pack.stickers));
      })
      .finally(() => setDetailLoading(false));
  }, [pack, open]);

  if (!pack) return null;

  const previewStickers = detailStickers.length > 0 ? detailStickers : getStickerFiles(pack.id, pack.stickers);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg border-border bg-card p-0 gap-0">
        {/* Banner */}
        <div className="relative bg-gradient-to-r from-brand/20 to-blue-600/10 p-5">
          <DialogHeader>
            <DialogTitle className="text-lg">{pack.name}</DialogTitle>
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
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" className="brand-gradient-btn gap-1">
              <Download className="h-3.5 w-3.5" />
              {pack.price === 0 ? t("stickerShop.download") : `${t("stickerShop.buyFor")} ${pack.price} ${t("stickerShop.coins")}`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => onGift(pack)}
            >
              <Gift className="h-3.5 w-3.5" />
              {t("stickerShop.gift")}
            </Button>
          </div>
        </div>

        {/* Sticker grid */}
        <div className="grid grid-cols-4 gap-2 p-4 sm:grid-cols-5 max-h-[50vh] overflow-y-auto">
          {previewStickers.map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setZoomedSticker(url)}
              className="flex aspect-square items-center justify-center rounded-lg bg-secondary/50 p-2 cursor-zoom-in hover:bg-secondary/80 transition-colors"
            >
              <img src={url} alt={`sticker-${i + 1}`} className="h-full w-full object-contain" />
            </button>
          ))}
        </div>

        {/* Sticker lightbox */}
        {zoomedSticker &&
          createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
              onClick={() => setZoomedSticker(null)}
            >
              <button
                className="absolute top-4 right-4 rounded-full bg-card/80 p-2 text-white hover:bg-accent transition-colors"
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
      </DialogContent>
    </Dialog>
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
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    if (!selectedFriend) return;
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setSelectedFriend(null);
      setMessage("");
      onClose();
    }, 1500);
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
              <div className="space-y-1">
                {MOCK_FRIENDS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFriend(f.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      selectedFriend === f.id
                        ? "bg-brand/15 ring-1 ring-brand/40"
                        : "hover:bg-secondary"
                    }`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                      {f.avatar}
                    </div>
                    <span className="text-sm">{f.name}</span>
                  </button>
                ))}
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
  const [selectedPack, setSelectedPack] = useState<StickerPack | null>(null);
  const [giftPack, setGiftPack] = useState<StickerPack | null>(null);
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [loading, setLoading] = useState(true);

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
  }, [packs, category, search]);

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
        <div className="flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-6">
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
