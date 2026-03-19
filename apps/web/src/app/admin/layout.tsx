"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { api, ApiError } from "@/lib/api";
import {
  LayoutDashboard,
  Users,
  Megaphone,
  Shield,
  Loader2,
  AlertTriangle,
  Sticker,
  TrendingUp,
  MessageSquare,
  FileText,
  Wrench,
  Bot,
  Filter,
  Flag,
  Heart,
  DollarSign,
  Activity,
  Ticket,
  Database,
  Mail,
  Globe,
  Lock,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

const NAV_ITEMS = [
  { href: "/admin", labelKey: "admin.nav.dashboard", icon: LayoutDashboard },
  { href: "/admin/users", labelKey: "admin.nav.users", icon: Users },
  { href: "/admin/trends", labelKey: "admin.nav.trends", icon: TrendingUp },
  { href: "/admin/messages", labelKey: "admin.nav.messages", icon: MessageSquare },
  { href: "/admin/agents", labelKey: "admin.nav.agents", icon: Bot },
  { href: "/admin/audit-logs", labelKey: "admin.nav.auditLogs", icon: FileText },
  { href: "/admin/content-filters", labelKey: "admin.nav.filters", icon: Filter },
  { href: "/admin/feature-flags", labelKey: "admin.nav.flags", icon: Flag },
  { href: "/admin/health", labelKey: "admin.nav.health", icon: Activity },
  { href: "/admin/revenue", labelKey: "admin.nav.revenue", icon: DollarSign },
  { href: "/admin/maintenance", labelKey: "admin.nav.maintenance", icon: Wrench },
  { href: "/admin/support-tickets", labelKey: "admin.nav.tickets", icon: Ticket },
  { href: "/admin/data-requests", labelKey: "admin.nav.gdpr", icon: Database },
  { href: "/admin/email-templates", labelKey: "admin.nav.emails", icon: Mail },
  { href: "/admin/ip-blacklist", labelKey: "admin.nav.ipBlock", icon: Globe },
  { href: "/admin/2fa", labelKey: "admin.nav.twoFA", icon: Lock },
  { href: "/admin/broadcast", labelKey: "admin.nav.broadcast", icon: Megaphone },
  { href: "/admin/review", labelKey: "admin.nav.review", icon: Shield },
  { href: "/admin/sticker-review", labelKey: "admin.nav.stickers", icon: Sticker },
  { href: "/admin/reports", labelKey: "admin.nav.reports", icon: AlertTriangle },
];

function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api("/api/admin/stats", { silent: true })
      .then(() => setAuthorized(true))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          router.replace("/");
        } else {
          setAuthorized(true); // network error — let pages handle it
        }
      })
      .finally(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authorized) return null;
  return <>{children}</>;
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <AdminGuard>
      <div className="flex h-dvh bg-background">
        {/* Sidebar — hidden on mobile */}
        <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-secondary">
          <div className="px-4 py-5">
            <h1 className="text-lg font-bold text-foreground">Admin</h1>
          </div>
          <nav className="flex-1 space-y-1 px-2">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Mobile top tabs */}
          <nav className="flex md:hidden border-b border-border bg-secondary overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    active
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>

          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </AdminGuard>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </AuthGuard>
  );
}
