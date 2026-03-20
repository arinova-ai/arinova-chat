"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  MessageSquare, Building2, Globe, Users, UserPlus, Wallet, Mic,
  Palette, Store, Settings, Smile, PenTool, Plus, X, Radio, BookOpen, Send,
  Brain, BookHeart, Eye, LayoutDashboard, type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { useShortcutStore } from "@/store/shortcut-store";
import { useAccountStore } from "@/store/account-store";
import { AddShortcutSheet } from "./add-shortcut-sheet";

/** Lucide icon per nav id — active/inactive styling via parent text color */
const NAV_ICONS: Record<string, LucideIcon> = {
  chat: MessageSquare,
  office: Building2,
  dashboard: LayoutDashboard,
  friends: UserPlus,
  subscribers: Users,
  settings: Settings,
};

/** Icon lookup for shortcut icon names */
const SHORTCUT_ICONS: Record<string, LucideIcon> = {
  globe: Globe,
  smile: Smile,
  "pen-tool": PenTool,
  store: Store,
  users: Users,
  wallet: Wallet,
  palette: Palette,
  "building-2": Building2,
};

export function MobileBottomNav() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const [fanOpen, setFanOpen] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  useEffect(() => {
    const fetchCount = () => {
      api<{ incoming: unknown[] }>("/api/friends/requests")
        .then((data) => setPendingRequestCount(data.incoming.length))
        .catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close fan menu on route change
  useEffect(() => {
    setFanOpen(false);
  }, [pathname]);

  const getActiveId = () => {
    if (pathname === "/" || pathname.startsWith("/chat")) return "chat";
    if (pathname.startsWith("/official") || pathname.startsWith("/lounge")) return "office";
    if (pathname.startsWith("/office")) return "office";
    if (pathname.startsWith("/friends")) return "friends";
    if (pathname.startsWith("/settings")) return "settings";
    return "chat";
  };

  const activeId = getActiveId();

  const activeAccount = useAccountStore((s) => s.accounts.find((a) => a.id === s.activeAccountId));

  const personalItems = [
    { id: "spaces", icon: Globe, label: t("nav.spaces"), href: "/spaces" },
    { id: "stickers", icon: Smile, label: t("nav.stickers"), href: "/stickers" },
    { id: "creator", icon: PenTool, label: t("nav.creator"), href: "/creator" },
    { id: "agent-hub", icon: Store, label: t("nav.agentHub"), href: "/agent-hub" },
    { id: "community", icon: Users, label: t("nav.community"), href: "/community" },
    { id: "wallet", icon: Wallet, label: t("nav.wallet"), href: "/wallet" },
    { id: "office-theme", icon: Palette, label: t("nav.themeStore"), href: "/office/themes" },
    { id: "explore-official", icon: Building2, label: t("nav.exploreOfficial"), href: "/explore/official" },
    { id: "explore-lounge", icon: Mic, label: t("nav.exploreLounge"), href: "/explore/lounge" },
  ];

  const officialItems = [
    { id: "broadcast", icon: Send, label: t("nav.broadcast"), href: `/official/${activeAccount?.id}/broadcast` },
    { id: "auto-reply", icon: MessageSquare, label: t("nav.autoReply"), href: `/official/${activeAccount?.id}/auto-reply` },
    { id: "knowledge", icon: BookOpen, label: t("nav.knowledge"), href: `/official/${activeAccount?.id}/knowledge` },
  ];

  const loungeItems = [
    { id: "persona", icon: Brain, label: t("nav.persona"), href: `/lounge/${activeAccount?.id}/persona` },
    { id: "diary", icon: BookHeart, label: t("nav.diary"), href: `/lounge/${activeAccount?.id}/diary` },
    { id: "preview", icon: Eye, label: t("nav.preview"), href: `/lounge/${activeAccount?.id}/preview` },
    { id: "fans", icon: Users, label: t("nav.fans"), href: `/lounge/${activeAccount?.id}/fans` },
  ];

  const sheetItems = !activeAccount
    ? personalItems
    : activeAccount.type === "official"
    ? officialItems
    : loungeItems;

  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const editing = useShortcutStore((s) => s.editing);
  const removeShortcut = useShortcutStore((s) => s.removeShortcut);
  const setEditing = useShortcutStore((s) => s.setEditing);
  const fetchShortcuts = useShortcutStore((s) => s.fetchShortcuts);
  const loaded = useShortcutStore((s) => s.loaded);
  const [addOpen, setAddOpen] = useState(false);

  // Long-press detection
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      setEditing(true);
    }, 500);
  }, [setEditing]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!loaded) fetchShortcuts();
  }, [loaded, fetchShortcuts]);

  // Exit edit mode when sheet closes
  useEffect(() => {
    if (!fanOpen) setEditing(false);
  }, [fanOpen, setEditing]);

  return (
    <>
      {/* Add shortcut sheet */}
      {addOpen && (
        <AddShortcutSheet
          open={addOpen}
          onOpenChange={setAddOpen}
        />
      )}

      {/* Bottom sheet menu */}
      <Sheet open={fanOpen} onOpenChange={setFanOpen}>
        <SheetContent
          side="bottom"
          showCloseButton
          className="rounded-t-2xl border-t border-border bg-card px-4 pt-2 pb-0 md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <SheetTitle className="sr-only">{t("common.menu")}</SheetTitle>
          <div className="grid grid-cols-4 gap-2 py-3">
            {sheetItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setFanOpen(false);
                    router.push(item.href);
                  }}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl p-2 transition-colors hover:bg-muted/50 active:bg-muted/70"
                  style={{ width: 76, height: 76 }}
                >
                  <Icon className="h-6 w-6 text-muted-foreground" />
                  <span className="text-[11px] font-medium text-foreground truncate max-w-full">{item.label}</span>
                </button>
              );
            })}

            {/* Custom shortcuts */}
            {shortcuts.map((sc, i) => {
              const Icon = SHORTCUT_ICONS[sc.icon] ?? Globe;
              return (
                <div
                  key={`sc-${i}`}
                  className="relative"
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                  onTouchCancel={handleTouchEnd}
                >
                  {editing && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeShortcut(i); }}
                      className="absolute -top-1 -right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (editing) return;
                      setFanOpen(false);
                      if (sc.url) router.push(sc.url);
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-xl p-2 transition-colors hover:bg-muted/50 active:bg-muted/70",
                      editing && "animate-wiggle"
                    )}
                    style={{ width: 76, height: 76 }}
                  >
                    <Icon className="h-6 w-6 text-muted-foreground" />
                    <span className="text-[11px] font-medium text-foreground truncate max-w-full">{sc.label}</span>
                  </button>
                </div>
              );
            })}

            {/* Add button */}
            {!editing && (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/30 p-2 transition-colors hover:bg-muted/50"
                style={{ width: 76, height: 76 }}
              >
                <Plus className="h-6 w-6 text-muted-foreground/50" />
                <span className="text-[11px] text-muted-foreground/50">{t("nav.addShortcut")}</span>
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Bottom nav bar — glassmorphism */}
      <nav
        className="relative flex shrink-0 items-center justify-around pt-2 md:hidden"
        style={{
          paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))",
          background: "rgba(22, 29, 42, 0.85)",
          backdropFilter: "blur(20px) saturate(1.2)",
          WebkitBackdropFilter: "blur(20px) saturate(1.2)",
          borderTop: "1px solid rgba(37, 45, 61, 0.6)",
        }}
      >
        {/* Chat */}
        <NavButton
          iconId="chat"
          label={t("nav.chat")}
          active={activeId === "chat"}
          onClick={() => router.push("/")}
        />

        {/* Office / Dashboard */}
        <NavButton
          iconId={activeAccount?.type === "official" || activeAccount?.type === "lounge" ? "dashboard" : "office"}
          label={activeAccount?.type === "official" || activeAccount?.type === "lounge" ? t("nav.dashboard") : t("nav.office")}
          active={activeId === "office"}
          onClick={() => {
            if (activeAccount?.type === "official") router.push(`/official/${activeAccount.id}/dashboard`);
            else if (activeAccount?.type === "lounge") router.push(`/lounge/${activeAccount.id}/dashboard`);
            else router.push("/office");
          }}
        />

        {/* Center Arinova button — elevated */}
        <div className="relative flex items-center justify-center" style={{ width: 64 }}>
          <button
            type="button"
            onClick={() => setFanOpen((v) => !v)}
            className={cn(
              "absolute -top-9 flex h-14 w-14 items-center justify-center rounded-full",
              "bg-gradient-to-br from-brand to-brand-gradient-end",
              "shadow-[0_0_16px_rgba(59,130,246,0.4)] border-2 border-brand-border-strong",
              "transition-transform duration-300"
            )}
            aria-label={fanOpen ? t("common.closeMenu") : t("common.openMenu")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/nav/logo-arinova-white.svg"
              alt="Arinova"
              width={28}
              height={28}
              className="transition-all duration-300 drop-shadow-[0_0_6px_rgba(147,197,253,0.6)]"
            />
          </button>
        </div>

        {/* Friends / Subscribers */}
        <div className="relative">
          {activeAccount?.type === "official" ? (
            <NavButton
              iconId="subscribers"
              label={t("nav.subscribers")}
              active={activeId === "friends"}
              onClick={() => router.push(`/official/${activeAccount.id}/subscribers`)}
            />
          ) : (
            <>
              <NavButton
                iconId="friends"
                label={t("nav.friends")}
                active={activeId === "friends"}
                onClick={() => router.push("/friends")}
              />
              {pendingRequestCount > 0 && (
                <span className="absolute -top-0.5 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[11px] font-medium text-white">
                  {pendingRequestCount}
                </span>
              )}
            </>
          )}
        </div>

        {/* Settings */}
        <NavButton
          iconId="settings"
          label={t("nav.settings")}
          active={activeId === "settings"}
          onClick={() => {
            if (activeAccount?.type === "official") router.push(`/official/${activeAccount.id}/settings`);
            else if (activeAccount?.type === "lounge") router.push(`/lounge/${activeAccount.id}/settings`);
            else router.push("/settings");
          }}
        />
      </nav>

    </>
  );
}

function NavButton({
  iconId,
  label,
  active,
  onClick,
}: {
  iconId: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = NAV_ICONS[iconId];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1 px-3 py-2 min-w-[64px] text-[11px] transition-colors",
        active ? "text-brand-text" : "text-muted-foreground"
      )}
    >
      {Icon && <Icon className="h-6 w-6" />}
      <span>{label}</span>
    </button>
  );
}
