"use client";

import { useEffect, useState } from "react";
import { wsManager, type ConnectionStatus } from "@/lib/ws";
import { WifiOff, RefreshCw } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export function ConnectionBanner() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ConnectionStatus>(wsManager.status);

  useEffect(() => {
    return wsManager.onStatusChange(setStatus);
  }, []);

  if (status === "connected") return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-yellow-600/80 px-3 py-1.5 text-xs text-white">
      {status === "syncing" ? (
        <>
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>{t("connection.syncing")}</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3 w-3" />
          <span>{t("connection.reconnecting")}</span>
        </>
      )}
    </div>
  );
}
