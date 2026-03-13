"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, User } from "lucide-react";
import { useVoiceCallStore } from "@/store/voice-call-store";
import { assetUrl } from "@/lib/config";
import { useTranslation } from "@/lib/i18n";

export function IncomingCall() {
  const { t } = useTranslation();
  const incomingCall = useVoiceCallStore((s) => s.incomingCall);
  const acceptCall = useVoiceCallStore((s) => s.acceptCall);
  const rejectCall = useVoiceCallStore((s) => s.rejectCall);

  if (!incomingCall) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-4 rounded-2xl border border-border bg-neutral-900/95 px-5 py-4 shadow-2xl backdrop-blur-sm animate-in slide-in-from-top-4 duration-300">
        {/* Caller avatar */}
        <div className="animate-pulse">
          <Avatar className="h-12 w-12">
            {incomingCall.callerAvatarUrl ? (
              <img
                src={assetUrl(incomingCall.callerAvatarUrl)}
                alt={incomingCall.callerName}
                className="h-full w-full object-cover"
              />
            ) : (
              <AvatarFallback className="bg-neutral-700 text-neutral-200">
                <User className="h-6 w-6" />
              </AvatarFallback>
            )}
          </Avatar>
        </div>

        {/* Caller info */}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {incomingCall.callerName}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("voice.incomingCall")}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 ml-2">
          <Button
            size="icon"
            className="h-10 w-10 rounded-full bg-green-500 text-white hover:bg-green-600"
            onClick={acceptCall}
          >
            <Phone className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            className="h-10 w-10 rounded-full bg-red-500 text-white hover:bg-red-600"
            onClick={rejectCall}
          >
            <PhoneOff className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
