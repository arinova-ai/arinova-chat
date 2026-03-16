"use client";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

/**
 * 20 placeholder default avatars. URLs will be replaced with actual assets later.
 * Using DiceBear Adventurer style as placeholders.
 */
const DEFAULT_AVATARS = Array.from({ length: 20 }, (_, i) =>
  `https://api.dicebear.com/9.x/adventurer/svg?seed=avatar${i + 1}`
);

interface DefaultAvatarPickerProps {
  onSelect: (url: string) => void;
  selected?: string | null;
  className?: string;
}

export function DefaultAvatarPicker({ onSelect, selected, className }: DefaultAvatarPickerProps) {
  const { t } = useTranslation();
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-medium text-muted-foreground">{t("avatar.pickDefault")}</p>
      <div className="grid grid-cols-5 gap-2">
        {DEFAULT_AVATARS.map((url) => (
          <button
            key={url}
            type="button"
            onClick={() => onSelect(url)}
            className={cn(
              "relative rounded-full overflow-hidden border-2 transition-all hover:scale-105",
              selected === url ? "border-brand ring-2 ring-brand/30" : "border-transparent hover:border-muted-foreground/30"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-10 w-10 rounded-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
