"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Play,
  Users,
  Star,
  Gamepad2,
  Gauge,
  Layers,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Mock detail data (matches list page MOCK_GAMES)
// ---------------------------------------------------------------------------

interface GameDetail {
  id: string;
  name: string;
  emoji: string;
  category: string;
  plays: number;
  rating: number;
  players: string;
  difficulty: string;
  description: string[];
  screenshots: string[]; // placeholder colors
  related: string[];
  iframeUrl?: string;
}

const GAME_DETAILS: Record<string, GameDetail> = {
  "who-is-killer": {
    id: "who-is-killer",
    name: "Who Is Killer?",
    emoji: "\ud83d\udd2a",
    category: "social",
    plays: 0,
    rating: 0,
    players: "3 players",
    difficulty: "Medium",
    description: [
      "Who Is Killer? is an AI-powered mystery deduction game. Three detectives each bring their own AI suspect into a murder case. Through rounds of public testimonies, private interrogations, and detective meetings, players must find the real killer.",
      "Each suspect is controlled by an AI agent with its own personality and secrets. The killer's agent will try to deceive the detectives while innocent agents may have their own hidden motives. Use clues, cross-examine testimonies, and collaborate with fellow detectives to crack the case.",
      "Features Arinova AI agent integration \u2014 bring your own custom AI agent to play as your suspect character!",
    ],
    screenshots: ["bg-red-900/40", "bg-slate-900/40", "bg-amber-900/40"],
    related: ["trivia-battle", "draw-together"],
    iframeUrl: "https://who-is-killer-cyan.vercel.app",
  },
  "draw-together": {
    id: "draw-together",
    name: "Draw Together",
    emoji: "\ud83c\udfa8",
    category: "social",
    plays: 340000,
    rating: 4.6,
    players: "2-8 players",
    difficulty: "Easy",
    description: [
      "Draw Together is a social drawing and guessing game where creativity meets fun. Take turns drawing a secret word while other players try to guess what it is before time runs out.",
      "With hundreds of word prompts across multiple categories, every round feels fresh. Earn points for both drawing skills and quick guesses. Compete with friends or jump into public rooms to meet new people.",
      "Features include custom word lists, different brush tools, replay sharing, and seasonal themed events. Whether you're an artist or a stick-figure enthusiast, everyone can enjoy the laughs!",
    ],
    screenshots: ["bg-rose-900/40", "bg-sky-900/40", "bg-amber-900/40", "bg-emerald-900/40"],
    related: ["trivia-battle", "word-chain"],
  },
  "pixel-dungeon": {
    id: "pixel-dungeon",
    name: "Pixel Dungeon",
    emoji: "\u2694\ufe0f",
    category: "action",
    plays: 120000,
    rating: 4.5,
    players: "1 player",
    difficulty: "Hard",
    description: [
      "Pixel Dungeon is an action RPG with roguelike elements set in a procedurally generated dungeon. Every run is different — explore randomized floors, battle unique monsters, and collect powerful loot.",
      "Choose from four distinct character classes, each with their own skill trees and playstyles. Manage your resources carefully as food, health potions, and weapon durability are scarce in the depths below.",
      "With permadeath mechanics and daily challenge runs, Pixel Dungeon offers endless replayability for those brave enough to descend into the darkness.",
    ],
    screenshots: ["bg-violet-900/40", "bg-slate-900/40", "bg-red-900/40", "bg-indigo-900/40"],
    related: ["tower-defense", "chess-arena"],
  },
  "word-chain": {
    id: "word-chain",
    name: "Word Chain",
    emoji: "\ud83d\udcdd",
    category: "puzzle",
    plays: 89000,
    rating: 4.2,
    players: "1-4 players",
    difficulty: "Medium",
    description: [
      "Word Chain is a brain-teasing word puzzle game where you connect letters to form words on a hexagonal grid. The longer the word, the higher your score!",
      "Challenge yourself in solo mode with timed rounds, or compete head-to-head with friends in multiplayer. Daily puzzles offer curated challenges that test your vocabulary to the limit.",
      "Unlock new grid layouts, power-ups, and cosmetic themes as you level up. Track your progress on global leaderboards and earn achievement badges.",
    ],
    screenshots: ["bg-purple-900/40", "bg-teal-900/40", "bg-orange-900/40"],
    related: ["memory-cards", "trivia-battle"],
  },
  "chess-arena": {
    id: "chess-arena",
    name: "Chess Arena",
    emoji: "\u265f\ufe0f",
    category: "strategy",
    plays: 200000,
    rating: 4.8,
    players: "2 players",
    difficulty: "Variable",
    description: [
      "Chess Arena brings the timeless game of chess to the digital world with ranked matchmaking, puzzles, and in-depth analysis tools. Play against opponents at your skill level from around the world.",
      "Features include multiple time controls (bullet, blitz, rapid, classical), puzzle rush mode, opening explorer, and post-game engine analysis. Learn from your mistakes and track your ELO rating over time.",
      "Join tournaments, follow top players, and study grandmaster games — all within a clean, modern interface designed for both beginners and experienced players.",
    ],
    screenshots: ["bg-emerald-900/40", "bg-blue-900/40", "bg-neutral-900/40", "bg-cyan-900/40"],
    related: ["tower-defense", "word-chain"],
  },
  "bubble-pop": {
    id: "bubble-pop",
    name: "Bubble Pop",
    emoji: "\ud83e\udee7",
    category: "casual",
    plays: 560000,
    rating: 4.0,
    players: "1 player",
    difficulty: "Easy",
    description: [
      "Bubble Pop is a classic casual bubble shooter with a colorful twist. Aim, shoot, and match three or more bubbles of the same color to pop them and clear the board.",
      "With over 500 hand-crafted levels, special bubble types, and satisfying chain reactions, there's always a new challenge waiting. Collect stars to unlock boosters and power-ups.",
    ],
    screenshots: ["bg-pink-900/40", "bg-yellow-900/40", "bg-sky-900/40"],
    related: ["memory-cards", "draw-together"],
  },
  "memory-cards": {
    id: "memory-cards",
    name: "Memory Cards",
    emoji: "\ud83c\udccf",
    category: "puzzle",
    plays: 75000,
    rating: 4.3,
    players: "1-2 players",
    difficulty: "Easy",
    description: [
      "Memory Cards is a beautifully designed matching puzzle game that trains your memory and concentration. Flip cards, find matching pairs, and try to clear the board in the fewest moves possible.",
      "Multiple card themes, increasing grid sizes, and multiplayer versus mode keep the challenge fresh. Perfect for a quick brain workout or a relaxing play session.",
    ],
    screenshots: ["bg-amber-900/40", "bg-rose-900/40", "bg-violet-900/40"],
    related: ["word-chain", "bubble-pop"],
  },
  "trivia-battle": {
    id: "trivia-battle",
    name: "Trivia Battle",
    emoji: "\ud83e\udde0",
    category: "social",
    plays: 180000,
    rating: 4.4,
    players: "2-6 players",
    difficulty: "Medium",
    description: [
      "Trivia Battle is a fast-paced multiplayer quiz game spanning categories from science and history to pop culture and sports. Test your knowledge and compete in real-time with friends or random opponents.",
      "Create custom quizzes, join daily tournaments, and climb the seasonal leaderboards. With thousands of community-submitted questions, you'll never see the same quiz twice.",
    ],
    screenshots: ["bg-blue-900/40", "bg-green-900/40", "bg-red-900/40"],
    related: ["draw-together", "chess-arena"],
  },
  "tower-defense": {
    id: "tower-defense",
    name: "Tower Defense",
    emoji: "\ud83c\udff0",
    category: "strategy",
    plays: 95000,
    rating: 4.1,
    players: "1 player",
    difficulty: "Medium",
    description: [
      "Tower Defense puts your strategic thinking to the test. Place and upgrade towers along the path to stop waves of enemies from reaching your base. Each tower type has unique abilities and upgrade paths.",
      "Dozens of maps, enemy types, and tower combinations offer deep strategic variety. Compete for high scores on each map or tackle the endless survival mode for the ultimate challenge.",
    ],
    screenshots: ["bg-teal-900/40", "bg-orange-900/40", "bg-slate-900/40"],
    related: ["chess-arena", "pixel-dungeon"],
  },
};

const CATEGORY_COLORS: Record<string, string> = {
  action: "bg-red-500/15 text-red-400",
  puzzle: "bg-purple-500/15 text-purple-400",
  strategy: "bg-teal-500/15 text-teal-400",
  social: "bg-blue-500/15 text-blue-400",
  casual: "bg-orange-500/15 text-orange-400",
};

function formatPlays(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function RelatedGameCard({ game }: { game: GameDetail }) {
  const catClass = CATEGORY_COLORS[game.category] ?? "bg-gray-500/15 text-gray-400";
  return (
    <Link
      href={`/spaces/${game.id}`}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-brand-border"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-secondary/50 text-2xl">
        {game.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-semibold truncate">{game.name}</h4>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${catClass}`}>
            {game.category}
          </span>
          <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
            <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
            {game.rating}
          </span>
        </div>
      </div>
    </Link>
  );
}

function GameDetailContent({ id }: { id: string }) {
  const router = useRouter();
  const { t } = useTranslation();
  const game = GAME_DETAILS[id];
  const [showIframe, setShowIframe] = useState(false);

  if (!game) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background">
        <Gamepad2 className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">{t("spaces.gameNotFound")}</p>
        <Button variant="secondary" onClick={() => router.push("/spaces")}>
          {t("spaces.backToSpaces")}
        </Button>
      </div>
    );
  }

  const catClass = CATEGORY_COLORS[game.category] ?? "bg-gray-500/15 text-gray-400";
  const relatedGames = game.related
    .map((rid) => GAME_DETAILS[rid])
    .filter(Boolean);

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-4">
          <button
            onClick={() => router.push("/spaces")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("spaces.backToSpaces")}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-24 md:pb-6">
          <div className="mx-auto max-w-4xl p-6 space-y-8">
            {/* Banner */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand/20 via-purple-600/10 to-blue-600/10 border border-brand/20 p-6 md:p-8">
              <div className="flex flex-col md:flex-row items-start gap-5">
                <div className="flex h-24 w-24 md:h-28 md:w-28 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-5xl md:text-6xl">
                  {game.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl md:text-3xl font-bold">{game.name}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${catClass}`}>
                      {game.category}
                    </span>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                      {game.rating}
                    </span>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      {formatPlays(game.plays)} {t("spaces.plays")}
                    </span>
                  </div>
                  <div className="mt-4">
                    <Button
                      className="brand-gradient-btn gap-2"
                      onClick={() => game.iframeUrl && setShowIframe(true)}
                    >
                      <Play className="h-4 w-4" />
                      {t("spaces.playNow")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Info cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <Layers className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-1.5 text-xs text-muted-foreground">{t("common.category")}</p>
                <p className="text-sm font-semibold capitalize">{game.category}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <Users className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-1.5 text-xs text-muted-foreground">{t("spaces.players")}</p>
                <p className="text-sm font-semibold">{game.players}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <Gauge className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-1.5 text-xs text-muted-foreground">{t("spaces.difficulty")}</p>
                <p className="text-sm font-semibold">{game.difficulty}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <Star className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-1.5 text-xs text-muted-foreground">{t("spaces.rating")}</p>
                <p className="text-sm font-semibold">{game.rating} / 5</p>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t("spaces.about")}
              </h2>
              <div className="space-y-3">
                {game.description.map((para, i) => (
                  <p key={i} className="text-sm leading-relaxed text-foreground/90">
                    {para}
                  </p>
                ))}
              </div>
            </div>

            {/* Screenshots */}
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t("spaces.screenshots")}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {game.screenshots.map((bg, i) => (
                  <div
                    key={i}
                    className={`aspect-video rounded-xl border border-border ${bg} flex items-center justify-center`}
                  >
                    <span className="text-3xl opacity-30">{game.emoji}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Related games */}
            {relatedGames.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("spaces.youMightLike")}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {relatedGames.map((g) => (
                    <RelatedGameCard key={g.id} game={g} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <MobileBottomNav />
      </div>

      {/* Fullscreen iframe overlay */}
      {showIframe && game.iframeUrl && (
        <div className="fixed inset-0 z-50 bg-background">
          <button
            onClick={() => setShowIframe(false)}
            className="absolute top-4 right-4 z-10 rounded-full bg-black/60 p-2 text-white backdrop-blur-sm transition hover:bg-black/80"
          >
            <X className="h-5 w-5" />
          </button>
          <iframe
            src={game.iframeUrl}
            className="h-full w-full border-none"
            allow="microphone; camera"
          />
        </div>
      )}
    </div>
  );
}

export default function SpaceDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <GameDetailContent id={id} />
    </AuthGuard>
  );
}
