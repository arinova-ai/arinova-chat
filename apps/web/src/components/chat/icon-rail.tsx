"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  MessageCircle,
  Globe,
  LayoutGrid,
  Settings,
  Users,
  Plus,
} from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { NewChatDialog } from "./new-chat-dialog";
import { FriendsDialog } from "../friends/friends-dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface NavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  href?: string;
  action?: () => void;
}

export function IconRail() {
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

  const navItems: NavItem[] = [
    { id: "chat", icon: <MessageCircle className="h-5 w-5" />, label: "Chat", href: "/" },
    { id: "spaces", icon: <Globe className="h-5 w-5" />, label: "Spaces", href: "/office" },
    { id: "apps", icon: <LayoutGrid className="h-5 w-5" />, label: "Apps", href: "/apps" },
    // TODO: Add Market item once Agent Marketplace feature is built
    // { id: "market", icon: <ShoppingBag className="h-5 w-5" />, label: "Market", href: "/market" },
  ];

  const getActiveId = () => {
    if (pathname === "/" || pathname.startsWith("/chat")) return "chat";
    if (pathname.startsWith("/office")) return "spaces";
    if (pathname.startsWith("/apps")) return "apps";
    if (pathname.startsWith("/settings")) return "settings";
    return "chat";
  };

  const activeId = getActiveId();

  return (
    <div className="flex h-full w-16 shrink-0 flex-col items-center border-r border-border bg-[oklch(0.14_0.025_260)] py-4">
      {/* Logo */}
      <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-lg font-bold text-white">
        A
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col items-center gap-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.href) router.push(item.href);
              else if (item.action) item.action();
            }}
            className={cn(
              "flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] transition-colors",
              activeId === item.id
                ? "bg-[oklch(0.55_0.2_250/15%)] text-[oklch(0.7_0.18_250)]"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}

        {/* New chat button */}
        <button
          type="button"
          onClick={() => setNewChatOpen(true)}
          className="mt-2 flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-[oklch(0.55_0.2_250)] hover:text-[oklch(0.7_0.18_250)]"
          title="New Chat"
        >
          <Plus className="h-4 w-4" />
        </button>

        {/* Friends button */}
        <button
          type="button"
          onClick={() => setFriendsOpen(true)}
          className="relative mt-1 flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          title="Friends"
        >
          <Users className="h-5 w-5" />
          {pendingRequestCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-medium text-white">
              {pendingRequestCount}
            </span>
          )}
        </button>
      </nav>

      {/* Bottom: Settings */}
      <button
        type="button"
        onClick={() => router.push("/settings")}
        className={cn(
          "flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] transition-colors",
          activeId === "settings"
            ? "bg-[oklch(0.55_0.2_250/15%)] text-[oklch(0.7_0.18_250)]"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        )}
      >
        <Settings className="h-5 w-5" />
        <span>Settings</span>
      </button>

      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} />
      <FriendsDialog open={friendsOpen} onOpenChange={setFriendsOpen} />
    </div>
  );
}
