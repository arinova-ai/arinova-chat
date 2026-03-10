/**
 * Local voice-call type stubs.
 * These will be replaced by shared types once the backend defines them.
 */

export type CallState = "idle" | "requesting_mic" | "ringing" | "connected" | "ended";

export type VoiceMode = "native" | "browser_stt_native_tts" | "full_fallback";

export interface TranscriptLine {
  id: string;
  speaker: "user" | "agent";
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface VoiceCapability {
  realtimeVoice?: boolean;
  tts?: boolean;
  stt?: boolean;
}

/** Incoming call info received via main WS */
export interface IncomingCallInfo {
  sessionId: string;
  callerId: string;
  callerName: string;
  callerAvatarUrl: string | null;
  conversationId: string;
  sdp: string;
}

/** Voice signaling WS events (client → server) */
export type VoiceWSClientEvent =
  | { type: "voice_offer"; sdp: string; conversationId: string; agentId?: string; targetUserId?: string }
  | { type: "voice_answer"; sdp: string; sessionId: string }
  | { type: "voice_ice_candidate"; candidate: RTCIceCandidateInit; sessionId?: string }
  | { type: "voice_hangup"; sessionId?: string }
  | { type: "voice_ping" };

/** Voice signaling WS events (server → client) */
export type VoiceWSServerEvent =
  | { type: "voice_offer"; sdp: string }
  | { type: "voice_answer"; sdp: string }
  | { type: "voice_ice_candidate"; candidate: RTCIceCandidateInit }
  | { type: "voice_call_start"; sessionId: string }
  | { type: "voice_call_end"; reason?: string }
  | { type: "voice_error"; error: string }
  | { type: "voice_pong" };
