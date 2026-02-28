"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import {
  Coins,
  Loader2,
  ArrowDownCircle,
  ArrowUpCircle,
  Sparkles,
  Wallet,
} from "lucide-react";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  createdAt: string;
}

const TOPUP_PLANS = [
  { id: "starter", label: "Starter", price: "$5", coins: 500, bonus: null },
  { id: "standard", label: "Standard", price: "$10", coins: 1100, bonus: "10% bonus" },
  { id: "advanced", label: "Advanced", price: "$25", coins: 3000, bonus: "20% bonus" },
  { id: "pro", label: "Pro", price: "$50", coins: 6500, bonus: "30% bonus" },
];

function WalletContent() {
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [topupLoading, setTopupLoading] = useState<string | null>(null);
  const [txPage, setTxPage] = useState(0);
  const [txTotal, setTxTotal] = useState(0);
  const txLimit = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [bal, txData] = await Promise.all([
        api<{ balance: number }>("/api/wallet/balance"),
        api<{ transactions: Transaction[]; total: number }>(
          `/api/wallet/transactions?limit=${txLimit}&offset=${txPage * txLimit}`
        ),
      ]);
      setBalance(bal.balance);
      setTransactions(txData.transactions);
      setTxTotal(txData.total);
    } catch {
      // auto-handled
    } finally {
      setLoading(false);
    }
  }, [txPage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTopup = async (planId: string, coins: number) => {
    setTopupLoading(planId);
    try {
      const result = await api<{ balance: number }>("/api/wallet/topup", {
        method: "POST",
        body: JSON.stringify({ amount: coins }),
      });
      setBalance(result.balance);
      // Refresh transactions
      const txData = await api<{ transactions: Transaction[]; total: number }>(
        `/api/wallet/transactions?limit=${txLimit}&offset=0`
      );
      setTransactions(txData.transactions);
      setTxTotal(txData.total);
      setTxPage(0);
    } catch {
      // auto-handled
    } finally {
      setTopupLoading(null);
    }
  };

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-5">
          <PageTitle icon={Wallet} title="Wallet" subtitle="Manage your credits" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 pb-24 md:pb-6">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-8">
              {/* Balance card */}
              <div className="rounded-2xl border border-border bg-card p-6 text-center">
                <p className="text-sm text-muted-foreground">Current Balance</p>
                <div className="mt-2 flex items-center justify-center gap-3">
                  <Coins className="h-8 w-8 text-yellow-500" />
                  <span className="text-4xl font-bold">
                    {(balance ?? 0).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">credits</p>
              </div>

              {/* Top-up plans */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Top Up
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {TOPUP_PLANS.map((plan) => (
                    <div
                      key={plan.id}
                      className="relative rounded-xl border border-border bg-card p-5 transition-colors hover:border-brand-border"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold">{plan.label}</h3>
                          <p className="text-2xl font-bold text-brand-text">
                            {plan.price}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="flex items-center gap-1 text-lg font-semibold">
                            <Coins className="h-4 w-4 text-yellow-500" />
                            {plan.coins.toLocaleString()}
                          </p>
                          {plan.bonus && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] text-green-400">
                              <Sparkles className="h-3 w-3" />
                              {plan.bonus}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        className="mt-3 w-full"
                        variant="secondary"
                        size="sm"
                        disabled={topupLoading !== null}
                        onClick={() => handleTopup(plan.id, plan.coins)}
                      >
                        {topupLoading === plan.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Purchase"
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transaction history */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Transaction History
                </h2>
                {transactions.length === 0 ? (
                  <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                    No transactions yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {transactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
                      >
                        {tx.amount > 0 ? (
                          <ArrowDownCircle className="h-5 w-5 shrink-0 text-green-400" />
                        ) : (
                          <ArrowUpCircle className="h-5 w-5 shrink-0 text-red-400" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {tx.description || tx.type}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(tx.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <span
                          className={`text-sm font-semibold ${
                            tx.amount > 0 ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {tx.amount > 0 ? "+" : ""}
                          {tx.amount}
                        </span>
                      </div>
                    ))}

                    {/* Pagination */}
                    {txTotal > txLimit && (
                      <div className="flex items-center justify-center gap-2 pt-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={txPage === 0}
                          onClick={() => setTxPage((p) => p - 1)}
                        >
                          Previous
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Page {txPage + 1} of {Math.ceil(txTotal / txLimit)}
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={(txPage + 1) * txLimit >= txTotal}
                          onClick={() => setTxPage((p) => p + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function WalletPage() {
  return (
    <AuthGuard>
      <WalletContent />
    </AuthGuard>
  );
}
