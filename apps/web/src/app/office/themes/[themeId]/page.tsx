"use client";

import { useState, useEffect, useRef, use } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Heart,
  Lock,
  Star,
  Users,
  Monitor,
  Clapperboard,
  Maximize,
  Tag,
} from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { ThemeProvider, useTheme } from "@/components/office/theme-context";
import { THEME_REGISTRY, type ThemeEntry } from "@/components/office/theme-registry";

// ── Mock data for detail page ───────────────────────────────────

interface ThemeDetails {
  author: { name: string; initial: string };
  rating: number;
  reviewCount: number;
  userCount: number;
  renderer: string;
  animationCount: number;
  roomSize: string;
  version: string;
  reviews: {
    name: string;
    initial: string;
    color: string;
    date: string;
    stars: number;
    text: string;
  }[];
}

const THEME_DETAILS: Record<string, ThemeDetails> = {
  "starter-desk": {
    author: { name: "Arinova Official", initial: "A" },
    rating: 4.6,
    reviewCount: 18,
    userCount: 230,
    renderer: "PixiJS 2D",
    animationCount: 4,
    roomSize: "Small",
    version: "v2.0",
    reviews: [
      { name: "Alex T.", initial: "A", color: "from-blue-500 to-blue-700", date: "3 days ago", stars: 5, text: "Great starter theme! Simple and clean, perfect for new users." },
      { name: "Jordan L.", initial: "J", color: "from-emerald-500 to-emerald-700", date: "1 week ago", stars: 4, text: "Does the job. Would be nice to have more customization options." },
    ],
  },
  "cozy-studio": {
    author: { name: "Arinova Official", initial: "A" },
    rating: 4.8,
    reviewCount: 23,
    userCount: 142,
    renderer: "Three.js 3D",
    animationCount: 15,
    roomSize: "Small",
    version: "v3.0",
    reviews: [
      { name: "Mike C.", initial: "M", color: "from-indigo-500 to-indigo-700", date: "2 days ago", stars: 5, text: "Love the warm atmosphere! The 3D room feels so cozy. Animations are smooth and the sleeping chain is a nice touch." },
      { name: "Sarah K.", initial: "S", color: "from-pink-500 to-pink-700", date: "1 week ago", stars: 4, text: "Beautiful design, well worth it. Would love more furniture options in future updates." },
    ],
  },
  "default-office": {
    author: { name: "Arinova Official", initial: "A" },
    rating: 4.5,
    reviewCount: 42,
    userCount: 389,
    renderer: "PixiJS 2D",
    animationCount: 8,
    roomSize: "Large",
    version: "v2.1",
    reviews: [
      { name: "David R.", initial: "D", color: "from-cyan-500 to-cyan-700", date: "5 days ago", stars: 5, text: "Perfect for team setups. The open-plan layout makes it easy to see all agents at once." },
      { name: "Emily W.", initial: "E", color: "from-violet-500 to-violet-700", date: "2 weeks ago", stars: 4, text: "Solid default choice. Clean and professional." },
    ],
  },
  "neon-lab": {
    author: { name: "Arinova Official", initial: "A" },
    rating: 4.7,
    reviewCount: 15,
    userCount: 67,
    renderer: "PixiJS 2D",
    animationCount: 10,
    roomSize: "Medium",
    version: "v2.0",
    reviews: [
      { name: "Leo Z.", initial: "L", color: "from-amber-500 to-amber-700", date: "1 day ago", stars: 5, text: "The neon glow is absolutely stunning. Best premium theme hands down." },
      { name: "Nina P.", initial: "N", color: "from-rose-500 to-rose-700", date: "4 days ago", stars: 5, text: "Worth every credit. The cyberpunk vibe is on point." },
    ],
  },
  "cloud-garden": {
    author: { name: "Arinova Official", initial: "A" },
    rating: 4.9,
    reviewCount: 11,
    userCount: 34,
    renderer: "PixiJS 2D",
    animationCount: 12,
    roomSize: "Large",
    version: "v2.0",
    reviews: [
      { name: "Yuki A.", initial: "Y", color: "from-sky-500 to-sky-700", date: "3 days ago", stars: 5, text: "Dreamy and beautiful. The watercolor art style is unique and relaxing." },
      { name: "Chris B.", initial: "C", color: "from-teal-500 to-teal-700", date: "1 week ago", stars: 5, text: "Best looking theme in the store. The floating island concept is genius." },
    ],
  },
};

const THUMB_LABELS = ["Room", "Character", "Night", "Details"];

// ── Components ──────────────────────────────────────────────────

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </span>
  );
}

function ThemeDetailContent({ entry, details }: { entry: ThemeEntry; details: ThemeDetails }) {
  const { themeId, switchTheme } = useTheme();
  const [toast, setToast] = useState(false);
  const [liked, setLiked] = useState(false);
  const [activeThumb, setActiveThumb] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActive = themeId === entry.id;
  const isFree = entry.price === "free";

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  const handleApply = () => {
    if (!isFree || isActive) return;
    switchTheme(entry.id);
    setToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), 2000);
  };

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-3">
          <Link
            href="/office/themes"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to themes
          </Link>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[1200px] mx-auto px-6 py-8 flex flex-col lg:flex-row gap-8">
            {/* Left: Preview + Reviews */}
            <div className="flex-1 min-w-0">
              {/* Preview image */}
              <div className="relative aspect-[16/10] rounded-2xl overflow-hidden border border-white/[0.08] bg-muted/30">
                <Image
                  src={entry.previewUrl}
                  alt={entry.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  priority
                />
                <span className="absolute top-3 left-3 rounded-md bg-black/60 backdrop-blur-sm px-2.5 py-1 text-xs text-slate-400">
                  Preview
                </span>
              </div>

              {/* Thumbnails */}
              <div className="flex gap-2 mt-3">
                {THUMB_LABELS.map((label, i) => (
                  <button
                    key={label}
                    onClick={() => setActiveThumb(i)}
                    className={`h-[50px] w-20 rounded-lg border-2 text-xs transition-colors ${
                      activeThumb === i
                        ? "border-brand text-brand-text"
                        : "border-transparent text-muted-foreground bg-muted/30 hover:bg-muted/50"
                    } flex items-center justify-center`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Reviews (desktop: below preview) */}
              <div className="mt-8 hidden lg:block">
                <ReviewsSection reviews={details.reviews} reviewCount={details.reviewCount} />
              </div>
            </div>

            {/* Right: Info panel */}
            <div className="w-full lg:w-[380px] shrink-0 space-y-5">
              {/* Badges */}
              <div className="flex gap-2">
                {details.renderer.includes("3D") && (
                  <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-400">
                    3D Theme
                  </span>
                )}
                {isFree ? (
                  <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                    Free
                  </span>
                ) : (
                  <span className="rounded-full bg-brand/20 px-2.5 py-0.5 text-[11px] font-semibold text-brand-text">
                    Premium
                  </span>
                )}
              </div>

              {/* Name */}
              <h1 className="text-[28px] font-bold leading-tight">{entry.name}</h1>

              {/* Author */}
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-brand to-orange-700 text-xs font-bold text-white">
                  {details.author.initial}
                </div>
                <span className="text-sm text-muted-foreground">
                  by <span className="font-medium text-brand-text">{details.author.name}</span>
                </span>
              </div>

              {/* Rating */}
              <div className="flex items-center gap-3">
                <StarRating rating={details.rating} />
                <span className="text-[13px] text-muted-foreground">
                  {details.rating} ({details.reviewCount})
                </span>
                <span className="text-[13px] text-muted-foreground">
                  · {details.userCount} users
                </span>
              </div>

              {/* Description */}
              <p className="text-sm leading-relaxed text-muted-foreground pb-5 border-b border-white/[0.06]">
                {entry.description}
              </p>

              {/* Agent capacity */}
              <div className="flex items-center gap-3 rounded-xl bg-brand/[0.08] border border-brand/15 p-3.5">
                <Users className="h-6 w-6 text-brand-text shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-brand-text">Agent Capacity</div>
                  <div className="text-sm text-foreground">
                    {entry.maxAgents} {entry.maxAgents === 1 ? "Agent" : "Agents"} · {details.roomSize} Room
                  </div>
                </div>
              </div>

              {/* Specifications */}
              <div className="pb-5 border-b border-white/[0.06]">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Specifications
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { icon: Monitor, label: "Renderer", value: details.renderer },
                    { icon: Clapperboard, label: "Animations", value: String(details.animationCount) },
                    { icon: Maximize, label: "Room Size", value: details.roomSize },
                    { icon: Tag, label: "Version", value: details.version },
                  ].map((spec) => (
                    <div key={spec.label} className="rounded-[10px] bg-white/[0.03] border border-white/[0.04] p-3">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                        <spec.icon className="h-3 w-3" />
                        {spec.label}
                      </div>
                      <div className="text-sm font-semibold">{spec.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Price */}
              <div>
                {isFree ? (
                  <div className="text-[32px] font-extrabold">Free</div>
                ) : (
                  <>
                    <div className="text-[32px] font-extrabold">
                      {entry.price} <span className="text-lg font-normal text-muted-foreground">credits</span>
                    </div>
                    <p className="text-xs text-muted-foreground">One-time purchase · Lifetime access</p>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2.5">
                {isActive ? (
                  <button
                    disabled
                    className="flex-1 rounded-xl bg-emerald-500/15 py-3.5 text-base font-bold text-emerald-400 flex items-center justify-center gap-2"
                  >
                    <Check className="h-5 w-5" />
                    Applied
                  </button>
                ) : isFree ? (
                  <button
                    onClick={handleApply}
                    className="flex-1 rounded-xl bg-gradient-to-r from-brand to-orange-700 py-3.5 text-base font-bold text-white transition-opacity hover:opacity-90"
                  >
                    Apply Theme
                  </button>
                ) : (
                  <button
                    disabled
                    className="flex-1 rounded-xl bg-gradient-to-r from-brand to-orange-700 py-3.5 text-base font-bold text-white opacity-80 flex items-center justify-center gap-2"
                  >
                    <Lock className="h-4 w-4" />
                    Purchase & Apply
                  </button>
                )}
                <button
                  onClick={() => setLiked(!liked)}
                  aria-label={liked ? "Remove from favorites" : "Add to favorites"}
                  className={`rounded-xl border px-5 py-3.5 transition-colors ${
                    liked
                      ? "border-pink-500/30 bg-pink-500/10 text-pink-400"
                      : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Heart className={`h-5 w-5 ${liked ? "fill-pink-400" : ""}`} />
                </button>
              </div>

              {/* Toast */}
              {toast && (
                <p className="text-center text-xs font-medium text-emerald-400 animate-pulse">
                  Theme applied!
                </p>
              )}

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                {entry.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-white/[0.04] border border-white/[0.06] px-3 py-1 text-xs text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Reviews (mobile: below info) */}
            <div className="lg:hidden">
              <ReviewsSection reviews={details.reviews} reviewCount={details.reviewCount} />
            </div>
          </div>
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

function ReviewsSection({
  reviews,
  reviewCount,
}: {
  reviews: ThemeDetails["reviews"];
  reviewCount: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold">Reviews</h2>
        <span className="text-[13px] text-muted-foreground">{reviewCount} reviews</span>
      </div>
      <div className="space-y-2.5">
        {reviews.map((review) => (
          <div
            key={review.name}
            className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3.5"
          >
            <div className="flex items-center gap-2.5 mb-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${review.color} text-[11px] font-bold text-white`}
              >
                {review.initial}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold">{review.name}</div>
                <div className="text-[11px] text-muted-foreground/60">{review.date}</div>
              </div>
              <StarRating rating={review.stars} />
            </div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{review.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotFoundContent() {
  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 min-w-0">
        <p className="text-muted-foreground">Theme not found.</p>
        <Link
          href="/office/themes"
          className="text-sm text-brand-text hover:underline"
        >
          Back to themes
        </Link>
        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function ThemeDetailPage({
  params,
}: {
  params: Promise<{ themeId: string }>;
}) {
  const { themeId } = use(params);
  const entry = THEME_REGISTRY.find((t) => t.id === themeId);
  const details = entry ? THEME_DETAILS[entry.id] : undefined;

  return (
    <AuthGuard>
      <ThemeProvider>
        {entry && details ? (
          <ThemeDetailContent entry={entry} details={details} />
        ) : (
          <NotFoundContent />
        )}
      </ThemeProvider>
    </AuthGuard>
  );
}
