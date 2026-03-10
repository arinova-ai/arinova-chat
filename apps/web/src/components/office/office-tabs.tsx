"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "scene", href: "/office" },
  { key: "tasks", href: "/office/tasks" },
  { key: "notes", href: "/office/notes" },
  { key: "activity", href: "/office/activity" },
  { key: "dashboard", href: "/office/dashboard" },
] as const;

export function OfficeTabs() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();

  const activeKey = TABS.find((tab) =>
    tab.href === "/office" ? pathname === "/office" : pathname.startsWith(tab.href),
  )?.key ?? "scene";

  return (
    <nav className="flex gap-0.5 px-2 py-1.5 overflow-x-auto scrollbar-none">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => router.push(tab.href)}
          className={cn(
            "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            activeKey === tab.key
              ? "bg-brand/15 text-brand-text"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          {t(`office.tab.${tab.key}`)}
        </button>
      ))}
    </nav>
  );
}
