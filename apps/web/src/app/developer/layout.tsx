"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ArrowLeft,
  LayoutDashboard,
  BookOpen,
  FileJson,
  Code,
  Upload,
  Coins,
  FlaskConical,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";

const sidebarSections = [
  {
    label: "OVERVIEW",
    items: [
      { label: "Dashboard", href: "/developer", icon: LayoutDashboard },
    ],
  },
  {
    label: "DOCUMENTATION",
    items: [
      { label: "Getting Started", href: "/developer/docs/getting-started", icon: BookOpen },
      { label: "Manifest Reference", href: "/developer/docs/manifest", icon: FileJson },
      { label: "SDK Reference", href: "/developer/docs/sdk", icon: Code },
      { label: "Submission Guide", href: "/developer/docs/submission", icon: Upload },
      { label: "Monetization", href: "/developer/docs/monetization", icon: Coins },
    ],
  },
  {
    label: "TOOLS",
    items: [
      { label: "Test Sandbox", href: "/developer/test", icon: FlaskConical },
    ],
  },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {sidebarSections.map((section) => (
        <div key={section.label}>
          <p className="mb-2 mt-6 first:mt-0 text-xs font-medium uppercase tracking-wider text-muted-foreground px-3">
            {section.label}
          </p>
          {section.items.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-neutral-800 text-white"
                    : "text-muted-foreground hover:text-foreground hover:bg-neutral-800/50"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export default function DeveloperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <AuthGuard>
      <div className="min-h-dvh bg-background">
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-border bg-background">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              {/* Mobile menu toggle */}
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <Link href="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <h1 className="text-lg font-bold">Developer Console</h1>
            </div>
            <Link href="/developer">
              <Button size="sm" className="gap-2">
                <Upload className="h-4 w-4" />
                Submit App
              </Button>
            </Link>
          </div>
        </header>

        <div className="flex">
          {/* Desktop sidebar */}
          <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-border bg-background">
            <div className="sticky top-14 overflow-y-auto p-4" style={{ maxHeight: "calc(100dvh - 3.5rem)" }}>
              <SidebarNav />
            </div>
          </aside>

          {/* Mobile sidebar (Sheet) */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="border-b border-border px-4 py-3">
                <SheetTitle>Developer Console</SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto p-4">
                <SidebarNav onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          {/* Main content */}
          <main className="flex-1 min-w-0 overflow-y-auto">
            <div className="p-6 lg:p-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
