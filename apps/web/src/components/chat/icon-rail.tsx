"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  MessageSquare, Building2, Globe, LayoutGrid, UserPlus,
  Palette, Users, Store, Wallet, Settings, type LucideIcon,
} from "lucide-react";
import { FriendsDialog } from "../friends/friends-dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Lucide icon per nav id — active/inactive styling via parent text color */
const NAV_ICONS: Record<string, LucideIcon> = {
  chat: MessageSquare,
  office: Building2,
  spaces: Globe,
  apps: LayoutGrid,
  friends: UserPlus,
  theme: Palette,
  community: Users,
  market: Store,
  wallet: Wallet,
  settings: Settings,
};

interface NavEntry {
  id: string;
  label: string;
  href?: string;
  action?: () => void;
}

export function IconRail() {
  const router = useRouter();
  const pathname = usePathname();
  const [friendsOpen, setFriendsOpen] = useState(false);
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

  const getActiveId = () => {
    if (pathname === "/" || pathname.startsWith("/chat")) return "chat";
    if (pathname.startsWith("/office/themes")) return "theme";
    if (pathname.startsWith("/office")) return "office";
    if (pathname.startsWith("/spaces")) return "spaces";
    if (pathname.startsWith("/apps")) return "apps";
    if (pathname.startsWith("/community")) return "community";
    if (pathname.startsWith("/marketplace")) return "market";
    if (pathname.startsWith("/creator")) return "market";
    if (pathname.startsWith("/wallet")) return "wallet";
    if (pathname.startsWith("/settings")) return "settings";
    return "chat";
  };

  const activeId = getActiveId();

  const mainItems: NavEntry[] = [
    { id: "chat", label: "Chat", href: "/" },
    { id: "office", label: "Office", href: "/office" },
    { id: "spaces", label: "Spaces", href: "/spaces" },
    { id: "apps", label: "Apps", href: "/apps" },
  ];

  const friendsItem: NavEntry = {
    id: "friends",
    label: "Friends",
    action: () => setFriendsOpen(true),
  };

  const secondaryItems: NavEntry[] = [
    { id: "community", label: "Community", href: "/community" },
    { id: "theme", label: "Theme", href: "/office/themes" },
    { id: "market", label: "Market", href: "/marketplace" },
    { id: "wallet", label: "Wallet", href: "/wallet" },
  ];

  const settingsItem: NavEntry = {
    id: "settings",
    label: "Settings",
    href: "/settings",
  };

  const renderButton = (item: NavEntry, extra?: React.ReactNode) => {
    const isActive = activeId === item.id;
    const Icon = NAV_ICONS[item.id];
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          if (item.href) router.push(item.href);
          else if (item.action) item.action();
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
    <div className="flex h-full w-16 shrink-0 flex-col items-center border-r border-border bg-[oklch(0.14_0.025_260)] py-4">
      {/* Logo */}
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-gradient-end">
        <img src="/assets/nav/logo-arinova-white.svg" alt="Arinova" width={28} height={28} className="h-7 w-7" />
      </div>

      {/* Main nav */}
      <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
        {mainItems.map((item) => renderButton(item))}

        {/* Friends with badge */}
        <div className="relative">
          {renderButton(friendsItem)}
          {pendingRequestCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-medium text-white pointer-events-none">
              {pendingRequestCount}
            </span>
          )}
        </div>

        {secondaryItems.map((item) => renderButton(item))}
      </nav>

      {/* Settings pinned to bottom */}
      <div className="mt-auto">
        {renderButton(settingsItem)}
      </div>

      <FriendsDialog open={friendsOpen} onOpenChange={setFriendsOpen} />
    </div>
  );
}
