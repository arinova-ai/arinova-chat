"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { useVoiceCallStore } from "@/store/voice-call-store";
import { useChatStore } from "@/store/chat-store";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export function CallIndicator() {
  const { t } = useTranslation();
  const callState = useVoiceCallStore((s) => s.callState);
  const peerName = useVoiceCallStore((s) => s.peerName);
  const callStartTime = useVoiceCallStore((s) => s.callStartTime);
  const callConversationId = useVoiceCallStore((s) => s.conversationId);
  const voiceMode = useVoiceCallStore((s) => s.voiceMode);
  const endCall = useVoiceCallStore((s) => s.endCall);
  const minimized = useVoiceCallStore((s) => s.minimized);
  const toggleMinimized = useVoiceCallStore((s) => s.toggleMinimized);
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  const [elapsed, setElapsed] = useState("00:00");

  useEffect(() => {
    if (callState !== "connected" || !callStartTime) return;
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - callStartTime) / 1000);
      const mins = String(Math.floor(diff / 60)).padStart(2, "0");
      const secs = String(diff % 60).padStart(2, "0");
      setElapsed(`${mins}:${secs}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [callState, callStartTime]);

  // Hide when idle, or when viewing the call conversation and NOT minimized
  if (callState === "idle") return null;
  if (activeConversationId === callConversationId && !minimized) return null;

  const isRinging = callState === "ringing" || callState === "requesting_mic";
  const isFallback = voiceMode !== "native";

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-full px-4 py-2 shadow-lg cursor-pointer",
        isRinging ? "bg-amber-600" : "bg-green-600"
      )}
      onClick={minimized ? toggleMinimized : undefined}
      title={minimized ? t("voice.expand") : undefined}
    >
      <Phone className="h-4 w-4 text-white" />
      <div className="text-sm text-white">
        <span className="font-medium">{peerName ?? ""}</span>
        <span className="ml-2 opacity-80">
          {isRinging ? t("voice.ringing") : elapsed}
        </span>
        {isFallback && callState === "connected" && (
          <span className="ml-1 text-xs opacity-60">({t("voice.fallbackMode")})</span>
        )}
      </div>
      <button
        type="button"
        onClick={endCall}
        className="ml-1 rounded-full p-1 hover:bg-white/20"
        title={t("voice.hangup")}
      >
        <PhoneOff className="h-3.5 w-3.5 text-white" />
      </button>
    </div>
  );
}
