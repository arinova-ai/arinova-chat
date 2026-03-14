"use client";

import { useEffect, useState } from "react";
import { Users, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";

interface Club {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  memberCount: number;
}

export default function ExploreClubsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Club[]>("/api/communities?type=community", { silent: true })
      .then(setClubs)
      .catch(() => setClubs([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <button type="button" onClick={() => router.back()} className="rounded-lg p-1 hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Users className="h-5 w-5 text-green-500" />
        <h1 className="text-lg font-semibold">{t("explore.communities")}</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-12">{t("common.loading")}</p>
        ) : clubs.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">{t("explore.noCommunities")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {clubs.map((club) => (
              <div key={club.id} className="rounded-xl border border-border p-4 hover:border-brand/50 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                    {club.avatarUrl ? (
                      <img src={club.avatarUrl} alt={club.name} className="h-12 w-12 rounded-full object-cover" />
                    ) : (
                      <Users className="h-6 w-6 text-green-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{club.name}</h3>
                    <span className="text-xs text-muted-foreground">{club.memberCount} {t("explore.members")}</span>
                  </div>
                </div>
                {club.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{club.description}</p>}
                <button
                  type="button"
                  onClick={() => router.push(`/community/${club.id}`)}
                  className="w-full rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
                >
                  {t("explore.join")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
