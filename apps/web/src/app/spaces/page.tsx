"use client";

import { useState, useMemo } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { PageTitle } from "@/components/ui/page-title";
import { Button } from "@/components/ui/button";
import { Search, Gamepad2, Star, Play, Users } from "lucide-react";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface Game {
  id: string;
  name: string;
  desc: string;
  category: string;
  plays: number;
  rating: number;
  featured?: boolean;
}

const MOCK_GAMES: Game[] = [
  { id: "draw-together", name: "Draw Together", desc: "Social drawing game \u2014 draw and guess with friends", category: "social", plays: 340000, rating: 4.6, featured: true },
  { id: "pixel-dungeon", name: "Pixel Dungeon", desc: "Action RPG with roguelike elements", category: "action", plays: 120000, rating: 4.5 },
  { id: "word-chain", name: "Word Chain", desc: "Word puzzle \u2014 connect letters to form words", category: "puzzle", plays: 89000, rating: 4.2 },
  { id: "chess-arena", name: "Chess Arena", desc: "Classic chess with ranked matchmaking", category: "strategy", plays: 200000, rating: 4.8 },
  { id: "bubble-pop", name: "Bubble Pop", desc: "Casual bubble shooter game", category: "casual", plays: 560000, rating: 4.0 },
  { id: "memory-cards", name: "Memory Cards", desc: "Memory matching puzzle game", category: "puzzle", plays: 75000, rating: 4.3 },
  { id: "trivia-battle", name: "Trivia Battle", desc: "Multiplayer trivia quiz game", category: "social", plays: 180000, rating: 4.4 },
  { id: "tower-defense", name: "Tower Defense", desc: "Strategic tower placement game", category: "strategy", plays: 95000, rating: 4.1 },
];

const CATEGORIES = ["All", "Action", "Puzzle", "Strategy", "Social", "Casual"];

const CATEGORY_COLORS: Record<string, string> = {
  action: "bg-red-500/15 text-red-400",
  puzzle: "bg-purple-500/15 text-purple-400",
  strategy: "bg-teal-500/15 text-teal-400",
  social: "bg-blue-500/15 text-blue-400",
  casual: "bg-orange-500/15 text-orange-400",
};

const GAME_EMOJIS: Record<string, string> = {
  "draw-together": "\ud83c\udfa8",
  "pixel-dungeon": "\u2694\ufe0f",
  "word-chain": "\ud83d\udcdd",
  "chess-arena": "\u265f\ufe0f",
  "bubble-pop": "\ud83e\udee7",
  "memory-cards": "\ud83c\udccf",
  "trivia-battle": "\ud83e\udde0",
  "tower-defense": "\ud83c\udff0",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPlays(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Featured Banner
// ---------------------------------------------------------------------------

function FeaturedBanner({ game }: { game: Game }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-brand/20 via-purple-600/10 to-blue-600/10 border border-brand/20 p-5 md:p-6">
      <div className="flex items-center gap-4 md:gap-6">
        <div className="flex h-20 w-20 md:h-24 md:w-24 shrink-0 items-center justify-center rounded-xl bg-white/5 text-4xl md:text-5xl">
          {GAME_EMOJIS[game.id] ?? "\ud83c\udfae"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-brand-text uppercase tracking-wide">Featured Game</p>
          <h3 className="mt-0.5 text-lg md:text-xl font-bold truncate">{game.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2 md:line-clamp-1">{game.desc}</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              {formatPlays(game.plays)} plays
            </span>
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
              {game.rating}
            </span>
          </div>
        </div>
        <Button size="sm" className="brand-gradient-btn gap-1 shrink-0">
          <Play className="h-3.5 w-3.5" />
          Play Now
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game Card
// ---------------------------------------------------------------------------

function GameCard({ game }: { game: Game }) {
  const categoryClass = CATEGORY_COLORS[game.category] ?? "bg-gray-500/15 text-gray-400";

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card transition-colors hover:border-brand-border">
      {/* Cover placeholder */}
      <div className="flex aspect-[4/3] items-center justify-center rounded-t-xl bg-secondary/50 text-4xl">
        {GAME_EMOJIS[game.id] ?? "\ud83c\udfae"}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start gap-2">
          <h3 className="flex-1 text-sm font-semibold truncate">{game.name}</h3>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${categoryClass}`}>
            {game.category}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{game.desc}</p>
        <div className="mt-auto pt-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Users className="h-3 w-3" />
              {formatPlays(game.plays)}
            </span>
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
              {game.rating}
            </span>
          </div>
          <Button size="sm" variant="secondary" className="h-7 gap-1 text-[11px] px-2.5">
            <Play className="h-3 w-3" />
            Play
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function SpacesContent() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const featuredGame = MOCK_GAMES.find((g) => g.featured);

  const filtered = useMemo(() => {
    let list = MOCK_GAMES;
    if (category !== "All") {
      list = list.filter((g) => g.category === category.toLowerCase());
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.desc.toLowerCase().includes(q),
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
            <PageTitle title="Spaces" subtitle="Games & social experiences" icon={Gamepad2} />
          </div>

          {/* Search */}
          <div className="mt-3 relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search games..."
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
            {/* Featured banner */}
            {featuredGame && category === "All" && !search.trim() && (
              <FeaturedBanner game={featuredGame} />
            )}

            {/* Grid */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Gamepad2 className="h-10 w-10 opacity-40 mb-2" />
                <p className="text-sm">No games found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </div>
            )}
          </div>
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function SpacesPage() {
  return (
    <AuthGuard>
      <SpacesContent />
    </AuthGuard>
  );
}
