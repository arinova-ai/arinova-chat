"use client";

import { createPortal } from "react-dom";
import { X, BarChart3, Settings } from "lucide-react";
import { useAccountStore, type Account } from "@/store/account-store";
import { useTranslation } from "@/lib/i18n";
import { OfficialSettings } from "./official-settings";
import { LoungeSettings } from "./lounge-settings";
import { AnalyticsPage } from "./analytics-page";
import { useState } from "react";

interface Props {
  account: Account;
  onClose: () => void;
}

export function AccountManageOverlay({ account, onClose }: Props) {
  const { t } = useTranslation();
  const [view, setView] = useState<"settings" | "analytics">("settings");

  const panel = (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div className="flex flex-col h-full w-full max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{account.name}</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-muted-foreground">
              {account.type === "official" ? t("accounts.typeOfficial") : t("accounts.typeLounge")}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setView("settings")}
              className={`rounded-lg p-1.5 ${view === "settings" ? "bg-accent" : "hover:bg-accent"}`}
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView("analytics")}
              className={`rounded-lg p-1.5 ${view === "analytics" ? "bg-accent" : "hover:bg-accent"}`}
            >
              <BarChart3 className="h-4 w-4" />
            </button>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-accent ml-2">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {view === "settings" ? (
            account.type === "official" ? (
              <OfficialSettings account={account} onClose={onClose} />
            ) : (
              <LoungeSettings account={account} onClose={onClose} />
            )
          ) : (
            <div className="h-full overflow-y-auto">
              <AnalyticsPage account={account} />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(panel, document.body) : null;
}
