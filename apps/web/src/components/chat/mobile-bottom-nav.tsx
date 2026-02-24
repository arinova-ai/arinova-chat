"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  MessageCircle,
  Building2,
  Settings,
  Users,
  Globe,
  Store,
} from "lucide-react";
import Image from "next/image";
import { FriendsDialog } from "../friends/friends-dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

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
    { id: "spaces", icon: Globe, label: "Spaces", href: "/office" },
    { id: "marketplace", icon: Store, label: "Market", href: "/apps" },
  ];

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
      <div className="fixed bottom-14 left-1/2 z-50 -translate-x-1/2 pb-[env(safe-area-inset-bottom,0px)] md:hidden pointer-events-none">
        <div className="relative h-28 w-40">
          {fanItems.map((item, i) => {
            const Icon = item.icon;
            // Fan out at angles: -40° and 40° from center
            const angle = i === 0 ? -40 : 40;
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
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[oklch(0.35_0.05_250)] shadow-lg shadow-blue-500/20 border border-[oklch(0.45_0.1_250)]">
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

      {/* Bottom nav bar */}
      <nav className="relative flex h-14 shrink-0 items-center justify-around border-t border-border bg-card pb-[env(safe-area-inset-bottom,0px)] md:hidden">
        {/* Chat */}
        <NavButton
          icon={MessageCircle}
          label="Chat"
          active={activeId === "chat"}
          onClick={() => router.push("/")}
        />

        {/* Office */}
        <NavButton
          icon={Building2}
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
              "absolute -top-5 flex h-14 w-14 items-center justify-center rounded-full",
              "bg-gradient-to-br from-[oklch(0.55_0.2_250)] to-[oklch(0.4_0.18_270)]",
              "shadow-[0_0_16px_rgba(59,130,246,0.4)] border-2 border-[oklch(0.5_0.15_250)]",
              "transition-transform duration-300",
              fanOpen && "rotate-45"
            )}
            aria-label={fanOpen ? "Close menu" : "Open menu"}
          >
            <Image
              src="/assets/branding/arinova-logo-64.png"
              alt="Arinova"
              width={32}
              height={32}
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
            icon={Users}
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
          icon={Settings}
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
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 px-3 py-1 text-[10px] transition-colors",
        active ? "text-[oklch(0.7_0.18_250)]" : "text-muted-foreground"
      )}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </button>
  );
}
