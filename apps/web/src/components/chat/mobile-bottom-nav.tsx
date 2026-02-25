"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Palette, Store, Globe } from "lucide-react";
import { FriendsDialog } from "../friends/friends-dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** SVG icon paths keyed by nav id — active/inactive variants */
const NAV_ICONS: Record<string, { active: string; inactive: string }> = {
  chat: {
    active: "/assets/nav/icon-chat-active.svg",
    inactive: "/assets/nav/icon-chat-inactive.svg",
  },
  office: {
    active: "/assets/nav/icon-office-active.svg",
    inactive: "/assets/nav/icon-office-inactive.svg",
  },
  friends: {
    active: "/assets/nav/icon-friends-active.svg",
    inactive: "/assets/nav/icon-friends-inactive.svg",
  },
  settings: {
    active: "/assets/nav/icon-settings-active.svg",
    inactive: "/assets/nav/icon-settings-inactive.svg",
  },
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

  const closeFan = useCallback(() => setFanOpen(false), []);

  const getActiveId = () => {
    if (pathname === "/" || pathname.startsWith("/chat")) return "chat";
    if (pathname.startsWith("/office")) return "office";
    if (pathname.startsWith("/settings")) return "settings";
    return "chat";
  };

  const activeId = getActiveId();

  const fanItems = [
    { id: "office-theme", icon: Palette, label: "Theme", href: "/office/themes" },
    { id: "marketplace", icon: Store, label: "Market", href: "/apps" },
    { id: "spaces", icon: Globe, label: "Spaces", href: "/spaces" },
  ];

  // 3 items: -45°, 0°, 45°
  const fanAngles = [-45, 0, 45];

  return (
    <>
      {/* Backdrop overlay when fan is open */}
      {fanOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden"
          onClick={closeFan}
        />
      )}

      {/* Fan sub-buttons */}
      <div className="fixed bottom-[4.75rem] left-1/2 z-50 -translate-x-1/2 pb-[env(safe-area-inset-bottom,0px)] md:hidden pointer-events-none">
        <div className="relative h-28 w-48">
          {fanItems.map((item, i) => {
            const Icon = item.icon;
            const angle = fanAngles[i];
            const radian = (angle * Math.PI) / 180;
            const radius = 80;
            const x = Math.sin(radian) * radius;
            const y = -Math.cos(radian) * radius;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setFanOpen(false);
                  router.push(item.href);
                }}
                className={cn(
                  "pointer-events-auto absolute bottom-0 left-1/2 flex flex-col items-center gap-1 transition-all",
                  fanOpen
                    ? "opacity-100 scale-100"
                    : "opacity-0 scale-50 pointer-events-none"
                )}
                style={{
                  transform: fanOpen
                    ? `translate(calc(-50% + ${x}px), ${y}px)`
                    : "translate(-50%, 0px)",
                  transitionDuration: fanOpen ? "300ms" : "200ms",
                  transitionTimingFunction: fanOpen
                    ? "cubic-bezier(0.34, 1.56, 0.64, 1)"
                    : "ease-in",
                  transitionDelay: fanOpen ? `${i * 60}ms` : "0ms",
                }}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-dark shadow-lg shadow-blue-500/20 border border-brand-border">
                  <Icon className="h-5 w-5 text-white" />
                </span>
                <span className="text-[10px] font-medium text-white drop-shadow-md">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom nav bar — glassmorphism */}
      <nav
        className="relative flex h-14 shrink-0 items-center justify-around pb-[env(safe-area-inset-bottom,0px)] md:hidden"
        style={{
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
              "transition-transform duration-300",
              fanOpen && "rotate-45"
            )}
            aria-label={fanOpen ? "Close menu" : "Open menu"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/nav/logo-arinova-white.svg"
              alt="Arinova"
              width={28}
              height={28}
              className={cn(
                "transition-all duration-300 drop-shadow-[0_0_6px_rgba(147,197,253,0.6)]",
                fanOpen && "brightness-125"
              )}
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
  const icons = NAV_ICONS[iconId];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1 px-3 py-1.5 min-w-[64px] text-[10px] transition-colors",
        active ? "text-brand-text" : "text-muted-foreground"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={active ? icons.active : icons.inactive}
        alt=""
        aria-hidden="true"
        width={24}
        height={24}
        className="h-6 w-6"
      />
      <span>{label}</span>
    </button>
  );
}
