"use client";

import { useEffect, useState } from "react";
import { Mic, Users, ArrowLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { Input } from "@/components/ui/input";

interface ExploreAccount {
  id: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  subscriberCount: number;
}

export default function ExplorLoungePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [accounts, setAccounts] = useState<ExploreAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    api<ExploreAccount[]>("/api/explore/lounge")
      .then(setAccounts)
      .finally(() => setLoading(false));
    // Check joined lounges
    api<{ loungeAccountId?: string; type?: string }[]>("/api/conversations")
      .then((convs) => {
        const ids = new Set<string>();
        convs.forEach((c) => { if (c.loungeAccountId) ids.add(c.loungeAccountId); });
        setJoinedIds(ids);
      })
      .catch(() => {});
  }, []);

  const filtered = search.trim()
    ? accounts.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()) || a.bio?.toLowerCase().includes(search.toLowerCase()))
    : accounts;

  return (
    <div className="flex flex-col h-full bg-background pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <button type="button" onClick={() => router.back()} className="rounded-lg p-1 hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Mic className="h-5 w-5 text-purple-500" />
        <h1 className="text-lg font-semibold">{t("explore.lounge")}</h1>
      </div>

      {/* Search */}
      <div className="px-4 pt-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("lounge.searchPlaceholder")}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-12">{t("common.loading")}</p>
        ) : accounts.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">{t("explore.noAccounts")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {filtered.map((acc) => (
              <Link
                key={acc.id}
                href={`/lounge/${acc.id}`}
                className="rounded-xl border border-border overflow-hidden hover:border-brand/50 transition-colors block"
              >
                {/* Cover area */}
                <div className="h-24 bg-gradient-to-br from-purple-500/20 to-pink-500/10 flex items-center justify-center">
                  {acc.avatar ? (
                    <img src={acc.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Mic className="h-8 w-8 text-purple-500/30" />
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 -mt-8 rounded-full bg-background border-2 border-background flex items-center justify-center overflow-hidden shrink-0">
                      {acc.avatar ? (
                        <img src={acc.avatar} alt={acc.name} className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <Mic className="h-5 w-5 text-purple-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate flex items-center gap-1.5">
                      {acc.name}
                      {joinedIds.has(acc.id) && (
                        <span className="shrink-0 rounded-full bg-brand/15 text-brand px-1.5 py-0.5 text-[9px] font-medium">{t("lounge.joined")}</span>
                      )}
                    </h3>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        <span>{acc.subscriberCount} {t("explore.subscribers")}</span>
                      </div>
                    </div>
                  </div>
                  {acc.bio && <p className="text-sm text-muted-foreground line-clamp-2">{acc.bio}</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
