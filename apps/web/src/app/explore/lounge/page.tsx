"use client";

import { useEffect, useState } from "react";
import { Mic, Users, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { useAccountStore } from "@/store/account-store";
import { GiftButton } from "@/components/accounts/gift-button";

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
  const subscribe = useAccountStore((s) => s.subscribe);
  const [accounts, setAccounts] = useState<ExploreAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<ExploreAccount[]>("/api/explore/lounge")
      .then(setAccounts)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full bg-background" style={{ paddingTop: "env(safe-area-inset-top)" }}>
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
              <div key={acc.id} className="rounded-xl border border-border p-4 hover:border-brand/50 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
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
                {acc.bio && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{acc.bio}</p>}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => subscribe(acc.id)}
                    className="flex-1 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
                  >
                    {t("explore.subscribe")}
                  </button>
                  <GiftButton accountId={acc.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
