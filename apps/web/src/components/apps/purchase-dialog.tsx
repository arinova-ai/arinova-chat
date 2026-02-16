"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Coins, AlertCircle } from "lucide-react";

interface Receipt {
  receiptId: string;
  productId: string;
  amount: number;
  timestamp: number;
}

interface PurchaseResponse {
  receipt: Receipt;
  newBalance: number;
}

interface PurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  amount: number;
  appId: string;
  onPurchased: (receipt: Receipt) => void;
}

export function PurchaseDialog({
  open,
  onOpenChange,
  productId,
  productName,
  amount,
  appId,
  onPurchased,
}: PurchaseDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    setError("");
    setLoading(true);

    try {
      const data = await api<PurchaseResponse>(`/api/apps/${appId}/purchase`, {
        method: "POST",
        body: JSON.stringify({
          productId,
          amount,
        }),
      });

      onPurchased(data.receipt);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to complete purchase");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (!loading) {
      setError("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Purchase</DialogTitle>
          <DialogDescription>
            Review your purchase details before confirming
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="flex items-start gap-3 rounded-lg bg-destructive/10 px-4 py-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">Purchase Failed</p>
                <p className="text-sm text-destructive/90">{error}</p>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border bg-neutral-800 p-4">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Product</p>
                <p className="font-semibold">{productName}</p>
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Price</p>
                <div className="flex items-center gap-2">
                  <Coins className="h-5 w-5 text-yellow-400" />
                  <span className="text-2xl font-bold">{amount}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-blue-500/10 px-4 py-3">
            <p className="text-sm text-blue-400">
              This amount will be deducted from your wallet balance.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading} className="gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Processing..." : "Confirm Purchase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
