"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Gift, X, Heart, Star, Gem, Sparkles, Crown, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccountStore } from "@/store/account-store";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const GIFT_TYPES = [
  { id: "heart", icon: Heart, color: "text-pink-500", amount: 10, label: "Heart" },
  { id: "star", icon: Star, color: "text-yellow-500", amount: 50, label: "Star" },
  { id: "gem", icon: Gem, color: "text-blue-500", amount: 100, label: "Gem" },
  { id: "sparkle", icon: Sparkles, color: "text-purple-500", amount: 200, label: "Sparkle" },
  { id: "crown", icon: Crown, color: "text-amber-500", amount: 500, label: "Crown" },
  { id: "flame", icon: Flame, color: "text-red-500", amount: 1000, label: "Flame" },
];

interface Props {
  accountId: string;
}

export function GiftButton({ accountId }: Props) {
  const { t } = useTranslation();
  const sendGift = useAccountStore((s) => s.sendGift);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [showAnimation, setShowAnimation] = useState<{ type: string; x: number; y: number } | null>(null);

  const handleSend = async (giftType: string, amount: number) => {
    setSending(giftType);
    try {
      await sendGift(accountId, giftType, amount);
      // Trigger animation
      setShowAnimation({ type: giftType, x: window.innerWidth / 2, y: window.innerHeight / 2 });
      setTimeout(() => setShowAnimation(null), 1500);
      setOpen(false);
    } finally {
      setSending(null);
    }
  };

  const AnimationIcon = showAnimation
    ? GIFT_TYPES.find((g) => g.id === showAnimation.type)?.icon ?? Gift
    : null;

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-pink-500"
        title={t("accounts.sendGift")}
      >
        <Gift className="h-5 w-5" />
      </Button>

      {/* Gift picker overlay */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <div className="relative z-10 w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-background p-4 animate-in slide-in-from-bottom">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold">{t("accounts.sendGift")}</h3>
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-accent">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {GIFT_TYPES.map((gift) => (
                  <button
                    key={gift.id}
                    type="button"
                    onClick={() => handleSend(gift.id, gift.amount)}
                    disabled={sending !== null}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl p-4 border border-border hover:border-brand transition-colors",
                      sending === gift.id && "opacity-50",
                    )}
                  >
                    <gift.icon className={cn("h-8 w-8", gift.color)} />
                    <span className="text-xs font-medium">{gift.label}</span>
                    <span className="text-[10px] text-muted-foreground">{gift.amount} coins</span>
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Gift animation */}
      {showAnimation &&
        AnimationIcon &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center">
            <div className="animate-bounce">
              <AnimationIcon className="h-24 w-24 text-pink-500 drop-shadow-lg animate-ping" />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
