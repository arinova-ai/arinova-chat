"use client";

import { type ReactNode, useEffect, useState } from "react";
import {
  Gamepad2, Loader2, type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useShortcutStore } from "@/store/shortcut-store";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";

interface SpaceItem {
  id: string;
  name: string;
  coverImageUrl?: string | null;
}

function ShortcutOptionList({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const addShortcut = useShortcutStore((s) => s.addShortcut);
  const [spaces, setSpaces] = useState<SpaceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ spaces: SpaceItem[] }>("/api/spaces?sort=newest&limit=20", { silent: true })
      .then((d) => setSpaces(d.spaces ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Filter out already-added spaces
  const available = spaces.filter(
    (s) => !shortcuts.some((sc) => sc.url === `/spaces/${s.id}`)
  );

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (available.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
        {spaces.length === 0 ? t("nav.noSpaces") : t("nav.allShortcutsAdded")}
      </p>
    );
  }

  return (
    <div className="flex flex-col py-1">
      {available.map((space) => (
        <button
          key={space.id}
          type="button"
          onClick={() => {
            addShortcut({
              type: "page",
              label: space.name,
              icon: "gamepad-2",
              url: `/spaces/${space.id}`,
            });
            onClose();
          }}
          className="flex h-12 items-center gap-3 px-4 text-left transition-colors hover:bg-muted/50 active:bg-muted/70"
        >
          {space.coverImageUrl ? (
            <img src={space.coverImageUrl} alt="" className="h-8 w-8 rounded-md object-cover shrink-0" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/15 shrink-0">
              <Gamepad2 className="h-4 w-4 text-brand-text" />
            </div>
          )}
          <span className="text-sm font-medium text-foreground truncate">{space.name}</span>
        </button>
      ))}
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
      <PopoverContent side="right" align="start" className="w-56 p-0">
        <p className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground">{t("nav.addShortcut")}</p>
        <ShortcutOptionList onClose={() => onOpenChange(false)} />
      </PopoverContent>
    </Popover>
  );
}
