"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Star, Loader2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface RatingDistribution {
  stars: number;
  count: number;
  pct: number;
}

interface RatingsData {
  avgRating: number;
  totalReviews: number;
  distribution: RatingDistribution[];
  dailyData: never[];
  recentReviews: never[];
}

const STAR_COLORS: Record<string, string> = {
  star5: "#22c55e",
  star4: "#3b82f6",
  star3: "#eab308",
  star2: "#f97316",
  star1: "#ef4444",
};

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i <= rating ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground/30"}`}
        />
      ))}
    </span>
  );
}

function RatingsContent() {
  const router = useRouter();
  const [data, setData] = useState<RatingsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<RatingsData>("/api/creator/ratings")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="app-dvh flex bg-background">
        <div className="hidden h-full md:block"><IconRail /></div>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const avgRating = data?.avgRating ?? 0;
  const totalReviews = data?.totalReviews ?? 0;
  const distribution = data?.distribution ?? [];

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block"><IconRail /></div>
      <div className="flex flex-1 flex-col min-w-0">
        <div className="shrink-0 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center gap-3">
            <Button size="icon-sm" variant="ghost" onClick={() => router.push("/creator")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Ratings Dashboard</h1>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 md:pb-6">
          <div className="mx-auto max-w-5xl space-y-6">
            {/* Summary row */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border-2 border-yellow-500/40 bg-card p-4">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                  <span className="text-xs text-muted-foreground">Average Rating</span>
                </div>
                <p className="mt-1 text-xl font-bold">{avgRating}</p>
                <StarDisplay rating={Math.round(avgRating)} />
              </div>
              <div className="rounded-xl border-2 border-blue-500/40 bg-card p-4">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-blue-400" />
                  <span className="text-xs text-muted-foreground">Total Reviews</span>
                </div>
                <p className="mt-1 text-xl font-bold">{totalReviews}</p>
              </div>
              {/* Distribution */}
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-2">Distribution</p>
                {distribution.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No reviews yet</p>
                ) : (
                  distribution.map((r) => (
                    <div key={r.stars} className="flex items-center gap-2 mb-1 last:mb-0">
                      <span className="text-[10px] w-6 text-right">{r.stars}★</span>
                      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${r.pct}%`, backgroundColor: STAR_COLORS[`star${r.stars}`] }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground w-6">{r.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {totalReviews === 0 && (
              <div className="rounded-xl border border-border bg-card p-8 text-center">
                <Star className="mx-auto h-8 w-8 text-muted-foreground opacity-40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No reviews yet. Reviews from your agents will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function RatingsPage() {
  return <AuthGuard><RatingsContent /></AuthGuard>;
}
