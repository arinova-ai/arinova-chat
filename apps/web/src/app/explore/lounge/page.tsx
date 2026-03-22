"use client";

import { useEffect, useState } from "react";
import { Mic, Users, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

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

  useEffect(() => {
    api<ExploreAccount[]>("/api/explore/lounge")
      .then(setAccounts)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full bg-background pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <button type="button" onClick={() => router.back()} className="rounded-lg p-1 hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Mic className="h-5 w-5 text-purple-500" />
        <h1 className="text-lg font-semibold">{t("explore.lounge")}</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-12">{t("common.loading")}</p>
        ) : accounts.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">{t("explore.noAccounts")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {accounts.map((acc) => (
              <Link
                key={acc.id}
                href={`/lounge/${acc.id}`}
                className="rounded-xl border border-border p-4 hover:border-brand/50 transition-colors block"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center overflow-hidden shrink-0">
                    {acc.avatar ? (
                      <img src={acc.avatar} alt={acc.name} className="h-12 w-12 rounded-full object-cover" />
                    ) : (
                      <Mic className="h-6 w-6 text-purple-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{acc.name}</h3>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      <span>{acc.subscriberCount} {t("explore.subscribers")}</span>
                    </div>
                  </div>
                </div>
                {acc.bio && <p className="text-sm text-muted-foreground line-clamp-2">{acc.bio}</p>}
                <Button variant="secondary" size="sm" className="w-full mt-3">
                  {t("lounge.viewDetail")}
                </Button>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
