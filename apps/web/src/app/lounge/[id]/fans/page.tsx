"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Search, Trophy, Ban, UserMinus, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";
import {
  useAccountStore,
  type FanEntry,
  type LeaderboardEntry,
} from "@/store/account-store";
import { cn } from "@/lib/utils";

type Tab = "all" | "leaderboard";
type SortKey = "spending" | "messages" | "level";

function getLevelBadgeClass(level: number): string {
  if (level >= 7) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/40";
  if (level >= 5) return "bg-purple-500/20 text-purple-400 border-purple-500/40";
  if (level >= 3) return "bg-blue-500/20 text-blue-400 border-blue-500/40";
  return "bg-gray-500/20 text-gray-400 border-gray-500/40";
}

function getRankDisplay(rank: number) {
  if (rank === 1) return { icon: true, color: "text-yellow-400" };
  if (rank === 2) return { icon: true, color: "text-gray-300" };
  if (rank === 3) return { icon: true, color: "text-amber-600" };
  return { icon: false, color: "text-muted-foreground" };
}

function AvatarFallback({ name, size }: { name: string; size: number }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className="rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0"
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  );
}

function UserAvatar({
  image,
  name,
  size = 32,
}: {
  image?: string | null;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (!image || failed) {
    return <AvatarFallback name={name} size={size} />;
  }

  return (
    <img
      src={image}
      alt={name}
      width={size}
      height={size}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}

export default function FansPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const accountId = params.id as string;

  const { loadFans, loadLeaderboard } = useAccountStore();

  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("spending");
  const [fans, setFans] = useState<FanEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [fansData, leaderboardData] = await Promise.all([
        loadFans(accountId),
        loadLeaderboard(accountId),
      ]);
      setFans(fansData);
      setLeaderboard(leaderboardData);
    } finally {
      setLoading(false);
    }
  }, [accountId, loadFans, loadLeaderboard]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredFans = useMemo(() => {
    let result = fans;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((fan) => fan.userName.toLowerCase().includes(q));
    }

    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case "spending":
          return b.totalSpent - a.totalSpent;
        case "messages":
          return b.totalMessages - a.totalMessages;
        case "level":
          return b.level - a.level;
        default:
          return 0;
      }
    });

    return result;
  }, [fans, searchQuery, sortKey]);

  const filteredLeaderboard = useMemo(() => {
    if (!searchQuery.trim()) return leaderboard;
    const q = searchQuery.toLowerCase();
    return leaderboard.filter((entry) =>
      entry.userName.toLowerCase().includes(q)
    );
  }, [leaderboard, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-background pt-[env(safe-area-inset-top)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">{t("lounge.fans.title")}</h1>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b px-4">
        <button
          className={cn(
            "flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors",
            activeTab === "all"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveTab("all")}
        >
          {t("lounge.fans.allFans")}
        </button>
        <button
          className={cn(
            "flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors",
            activeTab === "leaderboard"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveTab("leaderboard")}
        >
          <span className="inline-flex items-center gap-1.5">
            <Crown className="h-3.5 w-3.5" />
            {t("lounge.fans.leaderboard")}
          </span>
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={t("lounge.fans.search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "all" ? (
          <AllFansTab
            fans={filteredFans}
            sortKey={sortKey}
            onSortChange={setSortKey}
            loading={loading}
            t={t}
          />
        ) : (
          <LeaderboardTab
            entries={filteredLeaderboard}
            loading={loading}
            t={t}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  All Fans Tab                                                       */
/* ------------------------------------------------------------------ */

function AllFansTab({
  fans,
  sortKey,
  onSortChange,
  loading,
  t,
}: {
  fans: FanEntry[];
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  loading: boolean;
  t: (key: string) => string;
}) {
  const sortOptions: { value: SortKey; label: string }[] = [
    { value: "spending", label: t("lounge.fans.sortBySpending") },
    { value: "messages", label: t("lounge.fans.sortByMessages") },
    { value: "level", label: t("lounge.fans.sortByLevel") },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="px-4 pb-4">
      {/* Sort Selector */}
      <div className="flex items-center gap-2 pb-3">
        {sortOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSortChange(opt.value)}
            className={cn(
              "px-3 py-1 text-xs rounded-full border transition-colors",
              sortKey === opt.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {fans.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {t("lounge.fans.noFans")}
        </div>
      ) : (
        <div className="space-y-2">
          {fans.map((fan) => (
            <FanCard key={fan.userId} fan={fan} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function FanCard({ fan, t }: { fan: FanEntry; t: (key: string) => string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
      <UserAvatar image={fan.userImage} name={fan.userName} size={32} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{fan.userName}</span>
          <Badge
            variant="outline"
            className={cn("text-[10px] px-1.5 py-0", getLevelBadgeClass(fan.level))}
          >
            {t("lounge.fans.level")} {fan.level}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("lounge.fans.totalSpent")}: ${fan.totalSpent.toLocaleString()}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
          <Ban className="h-3.5 w-3.5" />
          <span className="sr-only">{t("lounge.fans.block")}</span>
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
          <UserMinus className="h-3.5 w-3.5" />
          <span className="sr-only">{t("lounge.fans.remove")}</span>
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Leaderboard Tab                                                    */
/* ------------------------------------------------------------------ */

function LeaderboardTab({
  entries,
  loading,
  t,
}: {
  entries: LeaderboardEntry[];
  loading: boolean;
  t: (key: string) => string;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        {t("lounge.fans.noLeaderboard")}
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 space-y-2">
      {entries.map((entry) => {
        const rankInfo = getRankDisplay(entry.rank);
        const isTopThree = entry.rank <= 3;

        return (
          <div
            key={entry.userId}
            className={cn(
              "flex items-center gap-3 rounded-lg border bg-card",
              isTopThree ? "p-4" : "p-3"
            )}
          >
            {/* Rank */}
            <div className="w-8 text-center shrink-0">
              {rankInfo.icon ? (
                <Trophy
                  className={cn("h-5 w-5 mx-auto", rankInfo.color)}
                />
              ) : (
                <span className={cn("text-sm font-semibold", rankInfo.color)}>
                  {entry.rank}
                </span>
              )}
            </div>

            <UserAvatar
              image={entry.userImage}
              name={entry.userName}
              size={isTopThree ? 40 : 32}
            />

            <div className="flex-1 min-w-0">
              <span
                className={cn(
                  "font-medium truncate block",
                  isTopThree ? "text-sm" : "text-sm"
                )}
              >
                {entry.userName}
              </span>
            </div>

            <span className="text-sm font-semibold text-muted-foreground shrink-0">
              ${entry.totalGifted.toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
