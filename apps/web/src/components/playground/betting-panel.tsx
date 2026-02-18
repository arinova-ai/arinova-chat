"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, TrendingUp, Coins } from "lucide-react";
import { api } from "@/lib/api";
import type { PlaygroundBettingConfig } from "@arinova/shared/types";

interface BettingPanelProps {
  sessionId: string;
  bettingConfig: PlaygroundBettingConfig;
  prizePool: number;
  currency: string;
}

export function BettingPanel({
  sessionId,
  bettingConfig,
  prizePool,
  currency,
}: BettingPanelProps) {
  const [amount, setAmount] = useState("");
  const [placing, setPlacing] = useState(false);

  if (!bettingConfig.enabled) return null;

  const handleBet = async () => {
    const betAmount = parseInt(amount, 10);
    if (!betAmount || betAmount <= 0) return;

    setPlacing(true);
    try {
      await api(`/api/playground/sessions/${sessionId}/bet`, {
        method: "POST",
        body: JSON.stringify({ amount: betAmount }),
      });
      setAmount("");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-neutral-900 p-3">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <TrendingUp className="h-4 w-4" />
        Betting
      </h3>

      {/* Prize pot display */}
      <div className="mb-3 flex items-center justify-between rounded-lg bg-neutral-800 px-3 py-2">
        <span className="text-xs text-muted-foreground">Prize Pool</span>
        <span className="flex items-center gap-1.5 text-sm font-medium text-amber-400">
          <Coins className="h-3.5 w-3.5" />
          {prizePool.toLocaleString()} {currency}
        </span>
      </div>

      {/* Bet input */}
      <div className="flex gap-2">
        <Input
          type="number"
          placeholder={`${bettingConfig.minBet}–${bettingConfig.maxBet}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min={bettingConfig.minBet}
          max={bettingConfig.maxBet}
          className="h-8 bg-neutral-800 border-none text-sm"
        />
        <Button
          size="sm"
          className="h-8 gap-1.5 shrink-0"
          onClick={handleBet}
          disabled={placing || !amount || parseInt(amount, 10) <= 0}
        >
          {placing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <TrendingUp className="h-3.5 w-3.5" />
          )}
          Bet
        </Button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Min: {bettingConfig.minBet} / Max: {bettingConfig.maxBet}
      </p>
    </div>
  );
}
