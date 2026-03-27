"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  MessageSquare, Building2, Globe, UserPlus,
  Palette, Users, Sparkles, Store, Wallet, Settings, Smile,
  LayoutDashboard, Plus, Mic, Check, Send, BookOpen, Brain,
  BookHeart, Eye, Scroll, type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { useShortcutStore } from "@/store/shortcut-store";
import { useNavPinStore, DEFAULT_NAV_IDS, PINNABLE_NAV_IDS } from "@/store/nav-pin-store";
import { useAccountStore } from "@/store/account-store";
import { AddShortcutPopover } from "./add-shortcut-sheet";
import { AccountSwitcher } from "@/components/accounts/account-switcher";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** Lucide icon per nav id */
const NAV_ICONS: Record<string, LucideIcon> = {
  chat: MessageSquare,
  office: Building2,
  spaces: Globe,
  stickers: Smile,
  creator: LayoutDashboard,
  friends: UserPlus,
  theme: Palette,
  community: Users,
  skills: Sparkles,
  "expert-hub": Scroll,
  market: Sparkles,
  wallet: Wallet,
  settings: Settings,
  "explore-official": Building2,
  "explore-lounge": Mic,
  // Official account
  "official-dashboard": LayoutDashboard,
  "official-broadcast": Send,
  "official-auto-reply": MessageSquare,
  "official-knowledge": BookOpen,
  "official-subscribers": Users,
  "official-settings": Settings,
  // Lounge account
  "lounge-dashboard": LayoutDashboard,
  "lounge-persona": Brain,
  "lounge-diary": BookHeart,
  "lounge-preview": Eye,
  "lounge-settings": Settings,
  "lounge-fans": Users,
};

const SHORTCUT_ICONS: Record<string, LucideIcon> = {
  globe: Globe,
  smile: Smile,
  "pen-tool": LayoutDashboard,
  store: Store,
  users: Users,
  wallet: Wallet,
  palette: Palette,
  "building-2": Building2,
};

interface NavEntry {
  id: string;
  label: string;
  href?: string;
}

export function IconRail() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
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

  const activeAccount = useAccountStore((s) => s.accounts.find((a) => a.id === s.activeAccountId));

  const getActiveId = () => {
    if (pathname === "/" || pathname.startsWith("/chat")) return "chat";
    if (pathname.startsWith("/office/themes")) return "theme";
    if (pathname.startsWith("/office")) return "office";
    if (pathname.startsWith("/spaces")) return "spaces";
    if (pathname.startsWith("/stickers")) return "stickers";
    if (pathname.startsWith("/creator")) return "creator";
    if (pathname.startsWith("/friends")) return "friends";
    if (pathname.startsWith("/explore/official")) return "explore-official";
    if (pathname.startsWith("/explore/lounge")) return "explore-lounge";
    if (pathname.startsWith("/community")) return "community";
    if (pathname.startsWith("/skills")) return "skills";
    if (pathname.startsWith("/expert-hub")) return "expert-hub";
    if (pathname.startsWith("/wallet")) return "wallet";
    if (pathname.startsWith("/settings")) return "settings";
    if (pathname.startsWith("/official") && activeAccount?.type === "official") {
      if (pathname.includes("/dashboard")) return "official-dashboard";
      if (pathname.includes("/broadcast")) return "official-broadcast";
      if (pathname.includes("/auto-reply")) return "official-auto-reply";
      if (pathname.includes("/knowledge")) return "official-knowledge";
      if (pathname.includes("/subscribers")) return "official-subscribers";
      if (pathname.includes("/settings")) return "official-settings";
    }
    if (pathname.startsWith("/lounge") && activeAccount?.type === "lounge") {
      if (pathname.includes("/dashboard")) return "lounge-dashboard";
      if (pathname.includes("/persona")) return "lounge-persona";
      if (pathname.includes("/diary")) return "lounge-diary";
      if (pathname.includes("/preview")) return "lounge-preview";
      if (pathname.includes("/settings")) return "lounge-settings";
      if (pathname.includes("/fans")) return "lounge-fans";
    }
    return "chat";
  };

  const activeId = getActiveId();

  // ── Official account nav items ──
  const officialItems: NavEntry[] = activeAccount ? [
    { id: "chat", label: t("nav.chat"), href: "/" },
    { id: "official-dashboard", label: t("nav.dashboard"), href: `/official/${activeAccount.id}/dashboard` },
    { id: "official-broadcast", label: t("nav.broadcast"), href: `/official/${activeAccount.id}/broadcast` },
    { id: "official-auto-reply", label: t("nav.autoReply"), href: `/official/${activeAccount.id}/auto-reply` },
    { id: "official-knowledge", label: t("nav.knowledge"), href: `/official/${activeAccount.id}/knowledge` },
    { id: "official-subscribers", label: t("nav.subscribers"), href: `/official/${activeAccount.id}/subscribers` },
    { id: "official-settings", label: t("nav.settings"), href: `/official/${activeAccount.id}/settings` },
  ] : [];

  // ── Lounge account nav items ──
  const loungeItems: NavEntry[] = activeAccount ? [
    { id: "chat", label: t("nav.chat"), href: "/" },
    { id: "lounge-dashboard", label: t("nav.dashboard"), href: `/lounge/${activeAccount.id}/dashboard` },
    { id: "lounge-persona", label: t("nav.persona"), href: `/lounge/${activeAccount.id}/persona` },
    { id: "lounge-diary", label: t("nav.diary"), href: `/lounge/${activeAccount.id}/diary` },
    { id: "lounge-preview", label: t("nav.preview"), href: `/lounge/${activeAccount.id}/preview` },
    { id: "lounge-settings", label: t("nav.loungeSettings"), href: `/lounge/${activeAccount.id}/settings` },
    { id: "lounge-fans", label: t("nav.fans"), href: `/lounge/${activeAccount.id}/fans` },
  ] : [];

  // ── Personal account nav items (order matters) ──
  const ALL_ITEMS: NavEntry[] = [
    { id: "chat", label: t("nav.chat"), href: "/" },
    { id: "office", label: t("nav.office"), href: "/office" },
    { id: "friends", label: t("nav.friends"), href: "/friends" },
    { id: "community", label: t("nav.community"), href: "/community" },
    { id: "stickers", label: t("nav.stickers"), href: "/stickers" },
    { id: "spaces", label: t("nav.spaces"), href: "/spaces" },
    { id: "explore-official", label: t("nav.exploreOfficial"), href: "/explore/official" },
    { id: "explore-lounge", label: t("nav.exploreLounge"), href: "/explore/lounge" },
    { id: "skills", label: t("nav.skills"), href: "/skills" },
    { id: "expert-hub", label: t("nav.expertHub"), href: "/expert-hub" },
    { id: "theme", label: t("nav.theme"), href: "/office/themes" },
    { id: "creator", label: t("nav.creator"), href: "/creator" },
    { id: "wallet", label: t("nav.wallet"), href: "/wallet" },
  ];

  const pinnedIds = useNavPinStore((s) => s.pinnedIds);
  const togglePin = useNavPinStore((s) => s.togglePin);

  const defaultSet = new Set<string>(DEFAULT_NAV_IDS);
  const pinnableSet = new Set<string>(PINNABLE_NAV_IDS);

  // Determine which items to show based on active account type
  const isOfficialAccount = activeAccount?.type === "official";
  const isLoungeAccount = activeAccount?.type === "lounge";

  const visibleItems = isOfficialAccount
    ? officialItems
    : isLoungeAccount
    ? loungeItems
    : ALL_ITEMS.filter(
        (item) => defaultSet.has(item.id) || pinnedIds.includes(item.id),
      );

  // Pinnable items for the popover (personal accounts only)
  const pinnableItems = ALL_ITEMS.filter((item) => pinnableSet.has(item.id));

  const settingsItem: NavEntry = {
    id: "settings",
    label: t("nav.settings"),
    href: "/settings",
  };

  // Custom shortcuts
  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const removeShortcut = useShortcutStore((s) => s.removeShortcut);
  const fetchShortcuts = useShortcutStore((s) => s.fetchShortcuts);
  const loaded = useShortcutStore((s) => s.loaded);
  const [addPopoverOpen, setAddPopoverOpen] = useState(false);
  const [pinPopoverOpen, setPinPopoverOpen] = useState(false);

  useEffect(() => {
    if (!loaded) fetchShortcuts();
  }, [loaded, fetchShortcuts]);

  const renderButton = (item: NavEntry, extra?: React.ReactNode) => {
    const isActive = activeId === item.id;
    const Icon = NAV_ICONS[item.id];
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          if (item.href) router.push(item.href);
        }}
        className={cn(
          "flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] transition-colors",
          isActive
            ? "bg-brand/15 text-brand-text"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
        title={item.label}
      >
        {Icon && <Icon className="h-6 w-6" />}
        <span>{item.label}</span>
        {extra}
      </button>
    );
  };

  return (
    <div className="flex h-full w-16 shrink-0 flex-col items-center border-r border-border bg-sidebar py-4">
      {/* Main nav */}
      <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto scrollbar-none">
        {visibleItems.map((item) =>
          item.id === "friends" ? (
            <div key={item.id} className="relative">
              {renderButton(item)}
              {pendingRequestCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-medium text-white pointer-events-none">
                  {pendingRequestCount}
                </span>
              )}
            </div>
          ) : (
            renderButton(item)
          ),
        )}

        {/* Custom shortcuts */}
        {shortcuts.map((sc, i) => {
          const Icon = SHORTCUT_ICONS[sc.icon] ?? Globe;
          return (
            <button
              key={`sc-${i}`}
              type="button"
              onClick={() => {
                if (sc.url) router.push(sc.url);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                removeShortcut(i);
              }}
              className={cn(
                "flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] transition-colors",
                "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
              title={sc.label}
            >
              <Icon className="h-6 w-6" />
              <span className="truncate max-w-[52px]">{sc.label}</span>
            </button>
          );
        })}

        {/* Pin nav items button */}
        <Popover open={pinPopoverOpen} onOpenChange={setPinPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] text-muted-foreground/50 border-2 border-dashed border-muted-foreground/20 hover:bg-accent/30 transition-colors mt-1"
              title={t("nav.addShortcut")}
            >
              <Plus className="h-5 w-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-52 p-1">
            <div className="space-y-0.5">
              {pinnableItems.map((item) => {
                const Icon = NAV_ICONS[item.id];
                const isPinned = pinnedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => togglePin(item.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                  >
                    {Icon && <Icon className="h-4 w-4 shrink-0" />}
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {isPinned && <Check className="h-3.5 w-3.5 text-brand-text shrink-0" />}
                  </button>
                );
              })}
            </div>
            {/* Divider + custom shortcuts link */}
            <div className="my-1 h-px bg-border" />
            <AddShortcutPopover open={addPopoverOpen} onOpenChange={setAddPopoverOpen}>
              <button
                type="button"
                onClick={() => setAddPopoverOpen(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{t("nav.addShortcut")}</span>
              </button>
            </AddShortcutPopover>
          </PopoverContent>
        </Popover>
      </nav>

      {/* Settings + Account pinned to bottom */}
      <div className="mt-auto flex flex-col items-center gap-2">
        {renderButton(settingsItem)}
        <AccountSwitcher />
      </div>

    </div>
  );
}
