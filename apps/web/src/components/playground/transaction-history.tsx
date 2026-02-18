"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api } from "@/lib/api";
import type { PlaygroundTransaction } from "@arinova/shared/types";

interface TransactionHistoryResponse {
  items: PlaygroundTransaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  entry_fee: { label: "Entry Fee", color: "text-red-400" },
  bet: { label: "Bet", color: "text-red-400" },
  win: { label: "Win", color: "text-green-400" },
  refund: { label: "Refund", color: "text-blue-400" },
  commission: { label: "Commission", color: "text-neutral-400" },
};

export function TransactionHistory() {
  const [data, setData] = useState<TransactionHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const result = await api<TransactionHistoryResponse>(
        `/api/playground/transactions?page=${p}&limit=20`,
        { silent: true },
      );
      setData(result);
      setPage(p);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="py-8 text-center">
        <Receipt className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No transactions yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Receipt className="h-4 w-4" />
        Transaction History
      </h3>

      <div className="space-y-1">
        {data.items.map((tx) => {
          const typeInfo = TYPE_LABELS[tx.type] ?? {
            label: tx.type,
            color: "text-muted-foreground",
          };
          const isCredit = tx.amount > 0;

          return (
            <div
              key={tx.id}
              className="flex items-center gap-3 rounded-lg bg-neutral-900 px-3 py-2"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-800">
                {isCredit ? (
                  <ArrowDownLeft className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <ArrowUpRight className="h-3.5 w-3.5 text-red-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${typeInfo.color}`}>
                  {typeInfo.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tx.currency} &middot;{" "}
                  {new Date(tx.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span
                className={`text-sm font-medium ${isCredit ? "text-green-400" : "text-red-400"}`}
              >
                {isCredit ? "+" : ""}
                {tx.amount.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={page <= 1 || loading}
            onClick={() => load(page - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            {page} / {data.pagination.totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={page >= data.pagination.totalPages || loading}
            onClick={() => load(page + 1)}
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
