"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Coins, Plus, ArrowUpCircle, ArrowDownCircle, RefreshCw, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface Transaction {
  id: string;
  type: "topup" | "purchase" | "refund" | "earning";
  amount: number;
  description: string;
  createdAt: string;
  relatedProductId: string | null;
}

interface BalanceResponse {
  balance: number;
}

interface TransactionsResponse {
  transactions: Transaction[];
}

function WalletContent() {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [topupDialogOpen, setTopupDialogOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupError, setTopupError] = useState("");

  const loadBalance = useCallback(async () => {
    try {
      const data = await api<BalanceResponse>("/api/wallet/balance");
      setBalance(data.balance);
    } catch {
      // ignore
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    try {
      const data = await api<TransactionsResponse>(
        "/api/wallet/transactions?limit=20&offset=0"
      );
      setTransactions(data.transactions);
    } catch {
      // ignore
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadBalance(), loadTransactions()]);
    setLoading(false);
  }, [loadBalance, loadTransactions]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTopup = async (amount: number) => {
    setTopupError("");
    setTopupLoading(true);
    try {
      const data = await api<BalanceResponse>("/api/wallet/topup", {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      setBalance(data.balance);
      setTopupDialogOpen(false);
      setCustomAmount("");
      await loadTransactions();
    } catch (err) {
      if (err instanceof ApiError) {
        setTopupError(err.message);
      } else {
        setTopupError("Failed to top up wallet");
      }
    } finally {
      setTopupLoading(false);
    }
  };

  const handleCustomTopup = () => {
    const amount = parseInt(customAmount, 10);
    if (!amount || amount <= 0) {
      setTopupError("Please enter a valid amount");
      return;
    }
    handleTopup(amount);
  };

  const getTransactionIcon = (type: Transaction["type"]) => {
    switch (type) {
      case "topup":
        return <ArrowUpCircle className="h-4 w-4 text-green-400" />;
      case "purchase":
        return <ArrowDownCircle className="h-4 w-4 text-red-400" />;
      case "refund":
        return <RefreshCw className="h-4 w-4 text-blue-400" />;
      case "earning":
        return <DollarSign className="h-4 w-4 text-green-400" />;
    }
  };

  const getTransactionBadge = (type: Transaction["type"]) => {
    switch (type) {
      case "topup":
        return (
          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
            Top-up
          </span>
        );
      case "purchase":
        return (
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
            Purchase
          </span>
        );
      case "refund":
        return (
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
            Refund
          </span>
        );
      case "earning":
        return (
          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
            Earning
          </span>
        );
    }
  };

  const formatAmount = (amount: number, type: Transaction["type"]) => {
    const sign = type === "topup" || type === "refund" || type === "earning" ? "+" : "-";
    return `${sign}${Math.abs(amount)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Wallet</h1>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Balance card */}
            <div className="mb-8 rounded-xl border border-border bg-card p-8 text-center">
              <div className="mb-2 flex items-center justify-center gap-2 text-muted-foreground">
                <Coins className="h-5 w-5" />
                <span className="text-sm font-medium">Current Balance</span>
              </div>
              <div className="mb-6 flex items-center justify-center gap-3">
                <Coins className="h-10 w-10 text-yellow-400" />
                <span className="text-5xl font-bold">{balance}</span>
              </div>
              <Button
                onClick={() => setTopupDialogOpen(true)}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Top Up Wallet
              </Button>
            </div>

            {/* Transaction history */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <h2 className="text-lg font-semibold">Transaction History</h2>
              </div>
              {transactions.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No transactions yet
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center gap-4 p-4 hover:bg-neutral-800/50"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800">
                        {getTransactionIcon(tx.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          {getTransactionBadge(tx.type)}
                        </div>
                        <p className="text-sm text-foreground">
                          {tx.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(tx.createdAt)}
                        </p>
                      </div>
                      <div
                        className={cn(
                          "text-lg font-bold",
                          tx.type === "purchase"
                            ? "text-red-400"
                            : "text-green-400"
                        )}
                      >
                        {formatAmount(tx.amount, tx.type)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Top-up dialog */}
      <Dialog open={topupDialogOpen} onOpenChange={setTopupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Top Up Wallet</DialogTitle>
            <DialogDescription>
              Choose a preset amount or enter a custom amount to add to your wallet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {topupError && (
              <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {topupError}
              </div>
            )}

            {/* Preset amounts */}
            <div className="grid grid-cols-2 gap-3">
              {[100, 500, 1000, 5000].map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  className="h-16 text-lg font-semibold"
                  onClick={() => handleTopup(amount)}
                  disabled={topupLoading}
                >
                  <Coins className="mr-2 h-5 w-5 text-yellow-400" />
                  {amount}
                </Button>
              ))}
            </div>

            {/* Custom amount */}
            <div className="space-y-2">
              <label htmlFor="customAmount" className="text-sm font-medium">
                Custom Amount
              </label>
              <div className="flex gap-2">
                <Input
                  id="customAmount"
                  type="number"
                  min="1"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="bg-neutral-800 border-none"
                  disabled={topupLoading}
                />
                <Button
                  onClick={handleCustomTopup}
                  disabled={topupLoading || !customAmount}
                >
                  {topupLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Add
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTopupDialogOpen(false);
                setCustomAmount("");
                setTopupError("");
              }}
              disabled={topupLoading}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
