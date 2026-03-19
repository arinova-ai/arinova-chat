"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bell, X } from "lucide-react";
import { subscribeToPush } from "@/lib/push";
import { useTranslation } from "@/lib/i18n";

const DISMISS_KEY = "notification-prompt-dismissed";
const REMIND_DAYS = 3;

function shouldShowPrompt(): boolean {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
  if (Notification.permission === "granted") return false;
  if (Notification.permission === "denied") return false;

  const dismissed = localStorage.getItem(DISMISS_KEY);
  if (dismissed) {
    const dismissedAt = parseInt(dismissed, 10);
    const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
    if (daysSince < REMIND_DAYS) return false;
  }

  return true;
}

function isIOSStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = "standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone;
  return isIOS && !isStandalone;
}

export function NotificationBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [showIOS, setShowIOS] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (isIOSStandalone()) {
      setShowIOS(true);
      setVisible(true);
    } else if (shouldShowPrompt()) {
      setVisible(true);
    }
  }, []);

  const handleEnable = async () => {
    setSubscribing(true);
    try {
      const success = await subscribeToPush();
      if (success) {
        setVisible(false);
      }
    } finally {
      setSubscribing(false);
    }
  };

  const handleLater = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setVisible(false);
  };

  if (!visible) return null;

  // iOS Home Screen guidance
  if (showIOS) {
    return (
      <div className="relative mx-2 mt-2 rounded-lg border border-border bg-card p-4">
        <button
          onClick={() => setVisible(false)}
          className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3">
          <Bell className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("notifications.iosTitle")}</p>
            <ol className="space-y-1 text-xs text-muted-foreground">
              <li>{t("notifications.iosStep1")}</li>
              <li>{t("notifications.iosStep2")}</li>
              <li>{t("notifications.iosStep3")}</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  // Standard notification permission prompt
  return (
    <div className="relative mx-2 mt-2 flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <Bell className="h-5 w-5 shrink-0 text-blue-400" />
      <p className="flex-1 text-sm">
        {t("notifications.enablePrompt")}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" onClick={handleLater}>
          {t("notifications.later")}
        </Button>
        <Button size="sm" onClick={handleEnable} disabled={subscribing}>
          {subscribing ? t("notifications.enabling") : t("notifications.enable")}
        </Button>
        <button
          onClick={handleLater}
          className="ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
