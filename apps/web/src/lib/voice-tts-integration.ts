/**
 * Integration between the voice call system and browser TTS.
 * Reads agent text responses aloud during active voice calls in fallback mode.
 *
 * Usage: Call `initVoiceTTSIntegration()` once during app startup (inside useEffect).
 * Returns a cleanup function.
 */

import { useVoiceCallStore } from "@/store/voice-call-store";
import { browserTTS } from "@/lib/speech-synthesis";
import { wsManager } from "@/lib/ws";
import type { WSServerEvent } from "@arinova/shared/types";

export function initVoiceTTSIntegration(): () => void {
  const handler = (event: WSServerEvent) => {
    // Only act on completed agent messages during an active call
    if (event.type !== "stream_end") return;

    const voiceState = useVoiceCallStore.getState();
    if (voiceState.callState !== "connected") return;
    if (voiceState.voiceMode === "native") return; // Native mode has real audio

    const { conversationId } = event;
    if (conversationId !== voiceState.conversationId) return;

    // Import chat store dynamically to avoid circular deps
    import("@/store/chat-store").then(({ useChatStore }) => {
      const chatState = useChatStore.getState();
      const msgs = chatState.messagesByConversation[conversationId] ?? [];
      const completedMsg = msgs.find((m) => m.id === event.messageId);
      if (!completedMsg || completedMsg.role !== "agent") return;

      const text = completedMsg.content;
      if (!text?.trim()) return;

      // Add to transcript
      voiceState.addTranscriptLine({
        id: `agent-${Date.now()}`,
        speaker: "agent",
        text,
        timestamp: Date.now(),
        isFinal: true,
      });

      // Read aloud via browser TTS
      if (browserTTS.isSupported()) {
        browserTTS.speak(text);
      }
    });
  };

  return wsManager.subscribe(handler);
}
