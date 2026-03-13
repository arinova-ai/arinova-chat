import { create } from "zustand";
import type { CallState, VoiceMode, TranscriptLine, IncomingCallInfo } from "@/lib/voice-types";
import { WebRTCClient } from "@/lib/webrtc-client";
import { speechRecognition } from "@/lib/speech-recognition";
import { browserTTS } from "@/lib/speech-synthesis";
import { startRingtone, stopRingtone } from "@/lib/ringtone";
import { api } from "@/lib/api";
import { useToastStore } from "@/store/toast-store";

interface VoiceCallState {
  callState: CallState;
  conversationId: string | null;

  // Peer info (works for both agent and user calls)
  peerId: string | null;
  peerName: string | null;
  peerAvatarUrl: string | null;
  peerType: "agent" | "user" | null;

  sessionId: string | null;
  isMuted: boolean;
  volume: number;
  voiceMode: VoiceMode;
  transcript: TranscriptLine[];
  transcriptEnabled: boolean;
  callStartTime: number | null;
  endReason: string | null;

  // Incoming call (from another user via main WS)
  incomingCall: IncomingCallInfo | null;

  // Minimize state
  minimized: boolean;

  // Internal
  _rtcClient: WebRTCClient | null;

  // Actions
  startCall: (conversationId: string, target: { agentId?: string; targetUserId?: string }, peerName: string, peerAvatarUrl: string | null, voiceMode: VoiceMode) => Promise<void>;
  receiveIncomingCall: (info: IncomingCallInfo) => void;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  dismissIncoming: () => void;
  endCall: () => void;
  toggleMute: () => void;
  setVolume: (volume: number) => void;
  toggleTranscript: () => void;
  toggleMinimized: () => void;
  addTranscriptLine: (line: TranscriptLine) => void;
  saveTranscript: () => Promise<void>;
}

export const useVoiceCallStore = create<VoiceCallState>((set, get) => ({
  callState: "idle",
  conversationId: null,
  peerId: null,
  peerName: null,
  peerAvatarUrl: null,
  peerType: null,
  sessionId: null,
  isMuted: false,
  volume: 0.8,
  voiceMode: "native",
  transcript: [],
  transcriptEnabled: typeof window !== "undefined"
    ? localStorage.getItem("arinova_voice_transcript") !== "false"
    : true,
  callStartTime: null,
  endReason: null,
  incomingCall: null,
  minimized: false,
  _rtcClient: null,

  startCall: async (conversationId, target, peerName, peerAvatarUrl, voiceMode) => {
    const addToast = useToastStore.getState().addToast;

    const peerType = target.agentId ? "agent" : "user";
    const peerId = target.agentId ?? target.targetUserId ?? null;

    set({
      callState: "requesting_mic",
      conversationId,
      peerId,
      peerName,
      peerAvatarUrl,
      peerType,
      voiceMode,
      transcript: [],
      endReason: null,
    });

    const client = new WebRTCClient();

    // Request microphone
    try {
      await client.requestMicrophone();
    } catch {
      addToast("無法存取麥克風，請檢查權限設定。");
      set({ callState: "idle", conversationId: null, peerId: null });
      return;
    }

    set({ callState: "ringing", _rtcClient: client });
    startRingtone();

    // Set up signaling handlers
    client.onSignaling((event) => {
      const state = get();
      if (event.type === "voice_answer" && state._rtcClient) {
        state._rtcClient.handleAnswer(event.sdp);
      } else if (event.type === "voice_ice_candidate" && state._rtcClient) {
        state._rtcClient.handleIceCandidate(event.candidate);
      } else if (event.type === "voice_ringing") {
        // H2H: got sessionId but callee hasn't answered yet, stay in ringing state
        state._rtcClient?.setSessionId(event.sessionId);
        set({ sessionId: event.sessionId });
      } else if (event.type === "voice_call_start") {
        stopRingtone();
        state._rtcClient?.setSessionId(event.sessionId);
        set({
          callState: "connected",
          sessionId: event.sessionId,
          callStartTime: Date.now(),
        });
        // Start browser STT if in fallback mode
        if (get().voiceMode !== "native") {
          startBrowserSTT();
        }
      } else if (event.type === "voice_call_end") {
        stopRingtone();
        get().endCall();
        if (event.reason) {
          set({ endReason: event.reason });
        }
      } else if (event.type === "voice_error") {
        stopRingtone();
        addToast(event.error);
        get().endCall();
      }
    });

    // Set up remote audio
    client.onRemoteTrack((_track, stream) => {
      client.setupRemoteAudio(stream);
      client.setVolume(get().volume);
    });

    client.onConnectionStateChange((state) => {
      if (state === "disconnected" || state === "failed") {
        get().endCall();
      }
    });

    // Connect signaling and create peer connection
    try {
      await client.connectSignaling();
      await client.createPeerConnection();
      await client.createOffer(conversationId, target);
    } catch {
      addToast("無法建立通話連線。");
      client.close();
      set({ callState: "idle", conversationId: null, peerId: null, _rtcClient: null });
    }
  },

  receiveIncomingCall: (info: IncomingCallInfo) => {
    const { callState, incomingCall } = get();

    // Ignore if already in a call or already have an incoming call
    if (callState !== "idle" || incomingCall) return;

    set({ incomingCall: info });

    // Auto-reject after 30 seconds if not handled
    setTimeout(() => {
      const current = get();
      if (current.incomingCall?.sessionId === info.sessionId) {
        current.rejectCall();
      }
    }, 30000);
  },

  acceptCall: async () => {
    const addToast = useToastStore.getState().addToast;
    const incoming = get().incomingCall;
    if (!incoming) return;

    set({
      callState: "requesting_mic",
      conversationId: incoming.conversationId,
      peerId: incoming.callerId,
      peerName: incoming.callerName,
      peerAvatarUrl: incoming.callerAvatarUrl,
      peerType: "user",
      voiceMode: "native",
      transcript: [],
      endReason: null,
      incomingCall: null,
    });

    const client = new WebRTCClient();

    // Request microphone
    try {
      await client.requestMicrophone();
    } catch {
      addToast("無法存取麥克風，請檢查權限設定。");
      set({ callState: "idle", conversationId: null, peerId: null });
      // Reject the call since we can't answer
      api(`/api/voice/calls/${incoming.sessionId}/reject`, { method: "POST", silent: true }).catch(() => {});
      return;
    }

    set({ _rtcClient: client, sessionId: incoming.sessionId });

    // Set up signaling handlers
    client.onSignaling((event) => {
      const state = get();
      if (event.type === "voice_ice_candidate" && state._rtcClient) {
        state._rtcClient.handleIceCandidate(event.candidate);
      } else if (event.type === "voice_call_end") {
        get().endCall();
        if (event.reason) {
          set({ endReason: event.reason });
        }
      } else if (event.type === "voice_error") {
        addToast(event.error);
        get().endCall();
      }
    });

    // Set up remote audio
    client.onRemoteTrack((_track, stream) => {
      client.setupRemoteAudio(stream);
      client.setVolume(get().volume);
    });

    client.onConnectionStateChange((state) => {
      if (state === "disconnected" || state === "failed") {
        get().endCall();
      }
    });

    // Connect signaling, create peer connection, handle offer and send answer
    try {
      await client.connectSignaling();
      await client.createPeerConnection();
      await client.handleOffer(incoming.sdp, incoming.sessionId);

      set({
        callState: "connected",
        callStartTime: Date.now(),
      });
    } catch {
      addToast("無法建立通話連線。");
      client.close();
      set({ callState: "idle", conversationId: null, peerId: null, _rtcClient: null, sessionId: null });
    }
  },

  rejectCall: () => {
    const incoming = get().incomingCall;
    if (!incoming) return;

    // Notify server
    api(`/api/voice/calls/${incoming.sessionId}/reject`, { method: "POST", silent: true }).catch(() => {});
    set({ incomingCall: null });
  },

  dismissIncoming: () => {
    set({ incomingCall: null });
  },

  endCall: () => {
    const { _rtcClient, callState, conversationId, transcriptEnabled, transcript } = get();

    if (callState === "idle") return;
    stopRingtone();

    // Send hangup signal (includes sessionId if available)
    _rtcClient?.sendHangup();
    _rtcClient?.close();

    // Stop browser STT/TTS
    speechRecognition.stop();
    browserTTS.cancel();

    // Save transcript if enabled and has content
    if (transcriptEnabled && transcript.length > 0 && conversationId) {
      get().saveTranscript();
    }

    set({
      callState: "idle",
      _rtcClient: null,
      sessionId: null,
      callStartTime: null,
      conversationId: null,
      peerId: null,
      peerName: null,
      peerAvatarUrl: null,
      peerType: null,
      minimized: false,
    });
  },

  toggleMute: () => {
    const { isMuted, _rtcClient } = get();
    const newMuted = !isMuted;
    _rtcClient?.setMuted(newMuted);

    // Also pause/resume browser STT
    if (newMuted) {
      speechRecognition.stop();
    } else if (get().voiceMode !== "native") {
      startBrowserSTT();
    }

    set({ isMuted: newMuted });
  },

  setVolume: (volume) => {
    const { _rtcClient } = get();
    _rtcClient?.setVolume(volume);
    set({ volume });
  },

  toggleTranscript: () => {
    const next = !get().transcriptEnabled;
    set({ transcriptEnabled: next });
    if (typeof window !== "undefined") {
      localStorage.setItem("arinova_voice_transcript", String(next));
    }
  },

  toggleMinimized: () => {
    set({ minimized: !get().minimized });
  },

  addTranscriptLine: (line) => {
    set((state) => {
      // If not final, update existing interim line from same speaker
      if (!line.isFinal) {
        const existing = state.transcript.findIndex(
          (t) => t.speaker === line.speaker && !t.isFinal
        );
        if (existing >= 0) {
          const updated = [...state.transcript];
          updated[existing] = line;
          return { transcript: updated };
        }
      }
      return { transcript: [...state.transcript, line] };
    });
  },

  saveTranscript: async () => {
    const { conversationId, transcript } = get();
    if (!conversationId || transcript.length === 0) return;

    // Combine transcript lines into a single message
    const finalLines = transcript.filter((t) => t.isFinal);
    if (finalLines.length === 0) return;

    const content = finalLines
      .map((t) => `**[${t.speaker === "user" ? "你" : "AI"}]** ${t.text}`)
      .join("\n\n");

    const transcriptMessage = `📞 **通話記錄**\n\n${content}`;

    try {
      await api(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: transcriptMessage,
          role: "agent",
        }),
        silent: true,
      });
    } catch {
      // Silently fail — transcript is best-effort
    }
  },
}));

/** Start browser STT and feed results into transcript */
function startBrowserSTT() {
  if (!speechRecognition.isSupported()) {
    useToastStore.getState().addToast("此瀏覽器不支援語音辨識，將使用文字輸入。");
    return;
  }

  speechRecognition.onResult((text, isFinal) => {
    const state = useVoiceCallStore.getState();
    state.addTranscriptLine({
      id: isFinal ? `stt-${Date.now()}` : "stt-interim",
      speaker: "user",
      text,
      timestamp: Date.now(),
      isFinal,
    });

    // In fallback mode, send final STT text as a chat message
    if (isFinal && text.trim() && state.conversationId) {
      // Import dynamically to avoid circular dependency
      import("@/lib/ws").then(({ wsManager }) => {
        wsManager.send({
          type: "send_message",
          conversationId: state.conversationId!,
          content: text.trim(),
        });
      });
    }
  });

  speechRecognition.onError((error) => {
    useToastStore.getState().addToast(`語音辨識錯誤: ${error}`);
  });

  speechRecognition.start("zh-TW");
}
