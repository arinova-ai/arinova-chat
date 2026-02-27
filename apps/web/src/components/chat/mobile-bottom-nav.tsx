"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  MessageSquare, Building2, Globe, Users, UserPlus, Wallet,
  Palette, Store, Settings, type LucideIcon,
} from "lucide-react";
import { FriendsDialog } from "../friends/friends-dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Lucide icon per nav id — active/inactive styling via parent text color */
const NAV_ICONS: Record<string, LucideIcon> = {
  chat: MessageSquare,
  office: Building2,
  friends: UserPlus,
  settings: Settings,
};

export function MobileBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [friendsOpen, setFriendsOpen] = useState(false);
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
    if (pathname.startsWith("/office")) return "office";
    if (pathname.startsWith("/settings")) return "settings";
    return "chat";
  };

  const activeId = getActiveId();

  const sheetItems = [
    { id: "spaces", icon: Globe, label: "Spaces", href: "/spaces" },
    { id: "marketplace", icon: Store, label: "Marketplace", href: "/marketplace" },
    { id: "community", icon: Users, label: "Community", href: "/community" },
    { id: "wallet", icon: Wallet, label: "Wallet", href: "/wallet" },
    { id: "office-theme", icon: Palette, label: "Theme Store", href: "/office/themes" },
  ];

  return (
    <>
      {/* Bottom sheet menu */}
      <Sheet open={fanOpen} onOpenChange={setFanOpen}>
        <SheetContent
          side="bottom"
          showCloseButton
          className="rounded-t-2xl border-t border-border bg-card px-0 pt-2 pb-0 md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <nav className="flex flex-col">
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
                  className="flex h-14 items-center gap-4 px-6 text-left transition-colors hover:bg-muted/50 active:bg-muted/70"
                >
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-[15px] font-medium text-foreground">{item.label}</span>
                </button>
              );
            })}
          </nav>
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
          label="Chat"
          active={activeId === "chat"}
          onClick={() => router.push("/")}
        />

        {/* Office */}
        <NavButton
          iconId="office"
          label="Office"
          active={activeId === "office"}
          onClick={() => router.push("/office")}
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
            aria-label={fanOpen ? "Close menu" : "Open menu"}
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

        {/* Friends */}
        <div className="relative">
          <NavButton
            iconId="friends"
            label="Friends"
            active={false}
            onClick={() => setFriendsOpen(true)}
          />
          {pendingRequestCount > 0 && (
            <span className="absolute -top-0.5 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-medium text-white">
              {pendingRequestCount}
            </span>
          )}
        </div>

        {/* Settings */}
        <NavButton
          iconId="settings"
          label="Settings"
          active={activeId === "settings"}
          onClick={() => router.push("/settings")}
        />
      </nav>

      <FriendsDialog open={friendsOpen} onOpenChange={setFriendsOpen} />
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
        "flex flex-col items-center justify-center gap-1 px-3 py-1.5 min-w-[64px] text-[10px] transition-colors",
        active ? "text-brand-text" : "text-muted-foreground"
      )}
    >
      {Icon && <Icon className="h-6 w-6" />}
      <span>{label}</span>
    </button>
  );
}
