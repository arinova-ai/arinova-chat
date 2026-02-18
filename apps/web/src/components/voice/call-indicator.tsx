"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { useVoiceCallStore } from "@/store/voice-call-store";
import { useChatStore } from "@/store/chat-store";
import { cn } from "@/lib/utils";

export function CallIndicator() {
  const callState = useVoiceCallStore((s) => s.callState);
  const agentName = useVoiceCallStore((s) => s.agentName);
  const callStartTime = useVoiceCallStore((s) => s.callStartTime);
  const callConversationId = useVoiceCallStore((s) => s.conversationId);
  const voiceMode = useVoiceCallStore((s) => s.voiceMode);
  const endCall = useVoiceCallStore((s) => s.endCall);
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

  // Hide when idle or when user is viewing the conversation with the call overlay
  if (callState === "idle") return null;
  if (activeConversationId === callConversationId) return null;

  const isRinging = callState === "ringing" || callState === "requesting_mic";
  const isFallback = voiceMode !== "native";

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-full px-4 py-2 shadow-lg",
        isRinging ? "bg-amber-600" : "bg-green-600"
      )}
    >
      <Phone className="h-4 w-4 text-white" />
      <div className="text-sm text-white">
        <span className="font-medium">{agentName ?? "Agent"}</span>
        <span className="ml-2 opacity-80">
          {isRinging ? "呼叫中..." : elapsed}
        </span>
        {isFallback && callState === "connected" && (
          <span className="ml-1 text-xs opacity-60">(降級)</span>
        )}
      </div>
      <button
        type="button"
        onClick={endCall}
        className="ml-1 rounded-full p-1 hover:bg-white/20"
        title="掛斷"
      >
        <PhoneOff className="h-3.5 w-3.5 text-white" />
      </button>
    </div>
  );
}
