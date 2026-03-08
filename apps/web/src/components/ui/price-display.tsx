import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Promotion {
  id: string;
  discountType: "percentage" | "fixed_amount" | "fixed_price";
  discountValue: number;
  displayName?: string;
  endsAt: string;
}

interface PriceDisplayProps {
  originalPrice: number;
  promotion?: Promotion | null;
  className?: string;
  size?: "sm" | "md" | "lg";
  showCountdown?: boolean;
}

function calcFinalPrice(
  original: number,
  promotion: Promotion
): number {
  switch (promotion.discountType) {
    case "percentage":
      return Math.max(0, Math.round(original * (1 - promotion.discountValue / 100)));
    case "fixed_amount":
      return Math.max(0, original - promotion.discountValue);
    case "fixed_price":
      return Math.max(0, promotion.discountValue);
    default:
      return original;
  }
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "";
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

export function PriceDisplay({
  originalPrice,
  promotion,
  className,
  size = "md",
  showCountdown = true,
}: PriceDisplayProps) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState("");

  const hasPromo = promotion && originalPrice > 0;
  const finalPrice = hasPromo ? calcFinalPrice(originalPrice, promotion) : originalPrice;
  const discountPercent = hasPromo && promotion.discountType === "percentage"
    ? promotion.discountValue
    : hasPromo
      ? Math.round(((originalPrice - finalPrice) / originalPrice) * 100)
      : 0;

  useEffect(() => {
    if (!hasPromo || !showCountdown) return;
    const endsAt = new Date(promotion.endsAt).getTime();
    const update = () => {
      const ms = endsAt - Date.now();
      setRemaining(ms > 0 ? formatCountdown(ms) : "");
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [hasPromo, promotion?.endsAt, showCountdown]);

  if (originalPrice === 0) {
    return (
      <span className={cn("font-semibold text-green-600", className)}>
        {t("promo.free")}
      </span>
    );
  }

  const textSize = size === "sm" ? "text-sm" : size === "lg" ? "text-xl" : "text-base";
  const smallSize = size === "sm" ? "text-xs" : size === "lg" ? "text-base" : "text-sm";

  return (
    <span className={cn("inline-flex items-center gap-1.5 flex-wrap", className)}>
      {hasPromo ? (
        <>
          <span className={cn("font-bold text-red-500", textSize)}>
            {finalPrice} {t("promo.coins")}
          </span>
          <span className={cn("line-through text-muted-foreground", smallSize)}>
            {originalPrice}
          </span>
          {discountPercent > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              -{discountPercent}%
            </Badge>
          )}
          {remaining && showCountdown && (
            <span className={cn("text-muted-foreground", smallSize)}>
              ⏱ {remaining}
            </span>
          )}
        </>
      ) : (
        <span className={cn("font-semibold", textSize)}>
          {originalPrice} {t("promo.coins")}
        </span>
      )}
    </span>
  );
}
