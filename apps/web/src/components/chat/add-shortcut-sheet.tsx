"use client";

import { type ReactNode } from "react";
import {
  Globe, Smile, PenTool, Store, Users, Wallet,
  Palette, Building2, type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useShortcutStore } from "@/store/shortcut-store";
import type { QuickShortcut } from "@/store/shortcut-store";
import { useTranslation } from "@/lib/i18n";

const ICON_MAP: Record<string, LucideIcon> = {
  globe: Globe,
  smile: Smile,
  "pen-tool": PenTool,
  store: Store,
  users: Users,
  wallet: Wallet,
  palette: Palette,
  "building-2": Building2,
};

const PRESET_SHORTCUTS: QuickShortcut[] = [
  { type: "page", label: "Spaces", icon: "globe", url: "/spaces" },
  { type: "page", label: "Sticker Shop", icon: "smile", url: "/stickers" },
  { type: "page", label: "Creator Console", icon: "pen-tool", url: "/creator" },
  { type: "page", label: "Skills", icon: "store", url: "/skills" },
  { type: "page", label: "Community", icon: "users", url: "/community" },
  { type: "page", label: "Wallet", icon: "wallet", url: "/wallet" },
  { type: "page", label: "Theme Store", icon: "palette", url: "/office/themes" },
];

function ShortcutOptionList({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const addShortcut = useShortcutStore((s) => s.addShortcut);

  // Filter out already-added shortcuts
  const available = PRESET_SHORTCUTS.filter(
    (preset) => !shortcuts.some((s) => s.url === preset.url)
  );

  if (available.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
        {t("nav.allShortcutsAdded")}
      </p>
    );
  }

  return (
    <div className="flex flex-col py-1">
      {available.map((preset) => {
        const Icon = ICON_MAP[preset.icon] ?? Globe;
        return (
          <button
            key={preset.url}
            type="button"
            onClick={() => {
              addShortcut(preset);
              onClose();
            }}
            className="flex h-12 items-center gap-3 px-4 text-left transition-colors hover:bg-muted/50 active:bg-muted/70"
          >
            <Icon className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{preset.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Mobile: bottom Sheet */
export function AddShortcutSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton
        className="rounded-t-2xl border-t border-border bg-card px-0 pt-2 pb-0 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <SheetTitle className="px-4 text-sm font-semibold">{t("nav.addShortcut")}</SheetTitle>
        <ShortcutOptionList onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

/** Desktop: Popover */
export function AddShortcutPopover({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-52 p-0">
        <p className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground">{t("nav.addShortcut")}</p>
        <ShortcutOptionList onClose={() => onOpenChange(false)} />
      </PopoverContent>
    </Popover>
  );
}
