"use client";

import { useEffect } from "react";
import { IncomingCall } from "./incoming-call";
import { useVoiceCallStore } from "@/store/voice-call-store";
import { wsManager } from "@/lib/ws";

export function GlobalIncomingCall() {
  // Listen for voice events on main WS (incoming calls, call ends)
  useEffect(() => {
    const unsub = wsManager.subscribe((event) => {
      if (event.type === "voice_incoming_call") {
        useVoiceCallStore.getState().receiveIncomingCall({
          sessionId: event.sessionId,
          callerId: event.callerId,
          callerName: event.callerName,
          callerAvatarUrl: event.callerAvatarUrl,
          conversationId: event.conversationId,
          sdp: event.sdp,
        });
      } else if (event.type === "voice_call_end") {
        // Dismiss incoming call if it was rejected/ended by caller
        const incoming = useVoiceCallStore.getState().incomingCall;
        if (incoming?.sessionId === event.sessionId) {
          useVoiceCallStore.getState().dismissIncoming();
        }
        // Also end active call if session matches
        const activeSession = useVoiceCallStore.getState().sessionId;
        if (activeSession === event.sessionId) {
          useVoiceCallStore.getState().endCall();
        }
      }
    });
    return unsub;
  }, []);

  return <IncomingCall />;
}
