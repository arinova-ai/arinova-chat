"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Coins, Gift, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface BalanceData {
  balance: number;
  lastGrantedAt: string | null;
}

interface ClaimResult {
  granted: boolean;
  amount: number;
  balance: number;
  nextClaimAt: string | null;
}

export function CoinBalance() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [nextClaimAt, setNextClaimAt] = useState<Date | null>(null);

  const loadBalance = useCallback(async () => {
    try {
      const data = await api<BalanceData>("/api/playground/coins/balance", {
        silent: true,
      });
      setBalance(data.balance);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const result = await api<ClaimResult>("/api/playground/coins/claim", {
        method: "POST",
      });
      setBalance(result.balance);
      if (result.nextClaimAt) {
        setNextClaimAt(new Date(result.nextClaimAt));
      }
    } catch (err: unknown) {
      // If 429, extract nextClaimAt from error response
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 429) {
        // Balance was returned in error response but api() throws — reload balance
        await loadBalance();
      }
    } finally {
      setClaiming(false);
    }
  };

  const canClaim = !nextClaimAt || new Date() >= nextClaimAt;

  return (
    <div className="flex items-center gap-2">
      {/* Balance display */}
      <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5">
        <Coins className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-medium text-amber-400">
          {loading ? "..." : (balance ?? 0).toLocaleString()}
        </span>
      </div>

      {/* Claim button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={handleClaim}
        disabled={claiming || !canClaim}
      >
        {claiming ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Gift className="h-3.5 w-3.5" />
        )}
        Claim
      </Button>
    </div>
  );
}
