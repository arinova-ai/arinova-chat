"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  MessageCircle,
  Globe,
  Settings,
  Users,
  Plus,
} from "lucide-react";
import { NewChatDialog } from "./new-chat-dialog";
import { FriendsDialog } from "../friends/friends-dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [newChatOpen, setNewChatOpen] = useState(false);
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

  useEffect(() => {
    const handler = () => setNewChatOpen(true);
    window.addEventListener("arinova:new-chat", handler);
    return () => window.removeEventListener("arinova:new-chat", handler);
  }, []);

  const getActiveId = () => {
    if (pathname === "/" || pathname.startsWith("/chat")) return "chat";
    if (pathname.startsWith("/office")) return "spaces";
    if (pathname.startsWith("/apps")) return "apps";
    if (pathname.startsWith("/settings")) return "settings";
    return "chat";
  };

  const activeId = getActiveId();

  const items = [
    { id: "chat", icon: MessageCircle, label: "Chat", href: "/" },
    { id: "spaces", icon: Globe, label: "Spaces", href: "/office" },
    { id: "new", icon: Plus, label: "New", action: () => setNewChatOpen(true) },
    { id: "friends", icon: Users, label: "Friends", action: () => setFriendsOpen(true), badge: pendingRequestCount },
    { id: "settings", icon: Settings, label: "Settings", href: "/settings" },
  ];

  return (
    <>
      <nav className="flex h-14 shrink-0 items-center justify-around border-t border-border bg-card pb-[env(safe-area-inset-bottom,0px)] md:hidden">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.action) item.action();
                else if (item.href) router.push(item.href);
              }}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 px-3 py-1 text-[10px] transition-colors",
                isActive
                  ? "text-[oklch(0.7_0.18_250)]"
                  : "text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
              {"badge" in item && item.badge ? (
                <span className="absolute top-0 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-medium text-white">
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} />
      <FriendsDialog open={friendsOpen} onOpenChange={setFriendsOpen} />
    </>
  );
}
