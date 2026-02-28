"use client";

import { useState, useMemo } from "react";
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
  Star,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface StickerPack {
  id: string;
  name: string;
  author: string;
  price: number;
  downloads: number;
  rating: number;
  category: string;
  stickers: number;
  coverUrl: string;
}

const MOCK_PACKS: StickerPack[] = [
  { id: "arinova-official", name: "Arinova Official", author: "Arinova", price: 0, downloads: 2300, rating: 5.0, category: "cute", stickers: 20, coverUrl: "/stickers/arinova-pack-01/01-hello.png" },
  { id: "cute-animals", name: "Cute Animals", author: "StudioCat", price: 50, downloads: 1800, rating: 4.5, category: "cute", stickers: 16, coverUrl: "/stickers/arinova-pack-01/04-happy.png" },
  { id: "emoji-remix", name: "Emoji Remix", author: "EmojiCo", price: 0, downloads: 5100, rating: 5.0, category: "funny", stickers: 24, coverUrl: "/stickers/arinova-pack-01/03-love.png" },
  { id: "spring-vibes", name: "Spring Vibes", author: "PastelDreams", price: 30, downloads: 890, rating: 4.0, category: "seasonal", stickers: 12, coverUrl: "/stickers/arinova-pack-01/05-sad.png" },
  { id: "anime-expressions", name: "Anime Expressions", author: "AnimeArtists", price: 80, downloads: 3200, rating: 4.5, category: "anime", stickers: 20, coverUrl: "/stickers/arinova-pack-01/06-angry.png" },
  { id: "meme-lords", name: "Meme Lords", author: "MemeHub", price: 0, downloads: 7500, rating: 5.0, category: "meme", stickers: 30, coverUrl: "/stickers/arinova-pack-01/07-surprised.png" },
  { id: "holiday-special", name: "Holiday Special", author: "SeasonalDesigns", price: 40, downloads: 1200, rating: 4.0, category: "seasonal", stickers: 16, coverUrl: "/stickers/arinova-pack-01/10-celebrate.png" },
  { id: "pixel-art", name: "Pixel Art", author: "RetroPixels", price: 60, downloads: 2100, rating: 4.5, category: "funny", stickers: 24, coverUrl: "/stickers/arinova-pack-01/08-thinking.png" },
];

const FEATURED_PACKS = MOCK_PACKS.slice(0, 3);

const CATEGORIES = ["All", "Cute", "Funny", "Anime", "Meme", "Seasonal"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function renderStars(rating: number) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${
            i < full
              ? "fill-yellow-500 text-yellow-500"
              : i === full && half
                ? "fill-yellow-500/50 text-yellow-500"
                : "text-muted-foreground/30"
          }`}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Featured Carousel
// ---------------------------------------------------------------------------

function FeaturedCarousel({ packs }: { packs: StickerPack[] }) {
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
          <p className="text-xs font-medium text-brand-text uppercase tracking-wide">Featured</p>
          <h3 className="mt-0.5 text-lg font-bold truncate">{pack.name}</h3>
          <p className="text-xs text-muted-foreground">
            by {pack.author} &middot; {pack.stickers} stickers
          </p>
          <div className="mt-2 flex items-center gap-2">
            <PriceBadge price={pack.price} />
            {renderStars(pack.rating)}
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

function PriceBadge({ price }: { price: number }) {
  if (price === 0) {
    return (
      <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-400">
        Free
      </span>
    );
  }
  return (
    <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[11px] font-medium text-yellow-400">
      {price} coins
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pack Card
// ---------------------------------------------------------------------------

function PackCard({ pack, onClick }: { pack: StickerPack; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-brand-border"
    >
      <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-secondary/50 p-3">
        <img
          src={pack.coverUrl}
          alt={pack.name}
          className="h-full w-full object-contain"
        />
      </div>
      <h3 className="mt-2.5 text-sm font-semibold truncate">{pack.name}</h3>
      <p className="text-[11px] text-muted-foreground truncate">by {pack.author}</p>
      <div className="mt-2 flex items-center gap-2">
        <PriceBadge price={pack.price} />
        <span className="ml-auto flex items-center gap-0.5 text-[11px] text-muted-foreground">
          <Download className="h-3 w-3" />
          {formatCount(pack.downloads)}
        </span>
      </div>
      <div className="mt-1.5">{renderStars(pack.rating)}</div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Pack Detail Dialog
// ---------------------------------------------------------------------------

const STICKER_FILES = Array.from({ length: 20 }, (_, i) => {
  const num = String(i + 1).padStart(2, "0");
  const names = [
    "hello", "thumbsup", "love", "happy", "sad", "angry", "surprised",
    "thinking", "sleepy", "celebrate", "fighting", "please", "ok",
    "awkward", "hug", "sparkle", "busy", "coffee", "goodnight", "amazing",
  ];
  return `/stickers/arinova-pack-01/${num}-${names[i]}.png`;
});

function PackDetailDialog({
  pack,
  open,
  onClose,
}: {
  pack: StickerPack | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!pack) return null;

  const previewStickers = STICKER_FILES.slice(0, pack.stickers);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg border-border bg-card p-0 gap-0">
        {/* Banner */}
        <div className="relative bg-gradient-to-r from-brand/20 to-blue-600/10 p-5">
          <DialogHeader>
            <DialogTitle className="text-lg">{pack.name}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              by {pack.author} &middot; {pack.stickers} stickers
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 flex items-center gap-3">
            <PriceBadge price={pack.price} />
            {renderStars(pack.rating)}
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <Download className="h-3 w-3" />
              {formatCount(pack.downloads)}
            </span>
          </div>
          <Button size="sm" className="brand-gradient-btn mt-3 gap-1">
            <Download className="h-3.5 w-3.5" />
            {pack.price === 0 ? "Download" : `Buy for ${pack.price} coins`}
          </Button>
        </div>

        {/* Sticker grid */}
        <div className="grid grid-cols-4 gap-2 p-4 sm:grid-cols-5 max-h-[50vh] overflow-y-auto">
          {previewStickers.map((url, i) => (
            <div
              key={i}
              className="flex aspect-square items-center justify-center rounded-lg bg-secondary/50 p-2"
            >
              <img src={url} alt={`sticker-${i + 1}`} className="h-full w-full object-contain" />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function StickerShopContent() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedPack, setSelectedPack] = useState<StickerPack | null>(null);

  const filtered = useMemo(() => {
    let list = MOCK_PACKS;
    if (category !== "All") {
      list = list.filter((p) => p.category === category.toLowerCase());
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
  }, [category, search]);

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-5">
          <div className="flex items-center gap-4">
            <PageTitle title="Sticker Shop" subtitle="Browse & collect sticker packs" icon={Sticker} />
          </div>

          {/* Search */}
          <div className="mt-3 relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search sticker packs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border-none bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Category pills */}
          <div className="mt-3 flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  category === cat
                    ? "bg-brand text-white"
                    : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-6">
          <div className="mx-auto max-w-5xl space-y-6">
            {/* Featured carousel */}
            <FeaturedCarousel packs={FEATURED_PACKS} />

            {/* Grid */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Sticker className="h-10 w-10 opacity-40 mb-2" />
                <p className="text-sm">No sticker packs found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((pack) => (
                  <PackCard
                    key={pack.id}
                    pack={pack}
                    onClick={() => setSelectedPack(pack)}
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
