"use client";

import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import { PipOverlay } from "@/components/pip-overlay";
import { InAppNotification } from "@/components/chat/in-app-notification";
import { PushNotificationHandler } from "@/components/push-notification-handler";
import { GlobalActiveCall } from "@/components/voice/global-active-call";
import { GlobalIncomingCall } from "@/components/voice/global-incoming-call";
import { GlobalOfficePip } from "@/components/global-float-chat";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        {children}
        <PipOverlay />
        <InAppNotification />
        <PushNotificationHandler />
        <GlobalActiveCall />
        <GlobalIncomingCall />
        <GlobalOfficePip />
      </I18nProvider>
    </ThemeProvider>
  );
}
