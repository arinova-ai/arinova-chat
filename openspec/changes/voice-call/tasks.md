## 1. Dependencies & Infrastructure

- [x] 1.1 Install `mediasoup` in server package
- [x] 1.2 Configure mediasoup worker and router (audio-only, Opus codec)
- [x] 1.3 Add STUN/TURN server configuration to environment variables
- [x] 1.4 Add `voiceCapable` field to agents table and run migration

## 2. WebRTC Signaling

- [x] 2.1 Create `/ws/voice` WebSocket endpoint with auth
- [x] 2.2 Implement SDP offer/answer exchange via signaling
- [x] 2.3 Implement ICE candidate relay
- [x] 2.4 Implement call session state machine (ringing → connected → ended)
- [x] 2.5 Implement ICE server list endpoint (`GET /api/voice/ice-servers`)

## 3. Server Media Relay

- [x] 3.1 Create mediasoup WebRTC transport for user connection
- [x] 3.2 Implement user audio consumer (receive audio from user's WebRTC track)
- [x] 3.3 Implement audio frame extraction from mediasoup consumer → raw PCM/Opus
- [x] 3.4 Implement audio frame injection into mediasoup producer → user playback
- [x] 3.5 Implement concurrent call limit enforcement

## 4. Agent Voice Protocol

- [x] 4.1 Extend agent WebSocket protocol with `voice_call_start` event (session ID, conversation context, audio format negotiation)
- [x] 4.2 Implement `voice_audio_chunk` binary event — server → agent (user audio frames)
- [x] 4.3 Implement `voice_audio_chunk` binary event — agent → server (agent audio frames)
- [x] 4.4 Implement `voice_call_end` event
- [x] 4.5 Implement audio format negotiation (PCM 16-bit 16kHz mono, Opus)

## 5. Agent Voice Capability Detection

- [x] 5.1 Extend agent health check to query `/status` for `capabilities.voice` field
- [x] 5.2 Store voice capability in agent health state (voiceCapable, tts, stt, realtimeVoice)
- [x] 5.3 Add `voiceCapable` toggle to agent edit form (manual override)
- [x] 5.4 Expose voice capability in agent API responses

## 6. Voice Fallback — Browser STT

- [x] 6.1 Implement Web Speech API `SpeechRecognition` wrapper with start/stop/result events
- [x] 6.2 Integrate browser STT into call flow — transcribe user speech → send as text message
- [x] 6.3 Handle browser STT unsupported (show error, fall back to text input)

## 7. Voice Fallback — Browser TTS

- [x] 7.1 Implement Web Speech API `SpeechSynthesis` wrapper with play/pause/cancel
- [x] 7.2 Integrate browser TTS into call flow — read agent text replies aloud
- [x] 7.3 Implement fallback mode detection (choose native vs browser STT/TTS per agent capability)

## 8. Call Transcript

- [x] 8.1 Implement live transcript collection during call (aggregate STT text from agent or browser)
- [x] 8.2 Display live transcript in chat area during active call
- [x] 8.3 Save transcript as messages in conversation on call end (if enabled)
- [x] 8.4 Add transcript toggle in call settings

## 9. Frontend — Call Button & Initiation

- [x] 9.1 Add call button to conversation header (visible for voice capable agents)
- [x] 9.2 Implement microphone permission request flow with guidance
- [x] 9.3 Build calling state UI ("呼叫中..." with agent avatar and cancel button)
- [x] 9.4 Implement WebRTC client (create peer connection, add audio track, handle signaling)

## 10. Frontend — Active Call UI

- [x] 10.1 Build active call view (agent name/avatar, duration timer, controls)
- [x] 10.2 Implement mute toggle (stop/resume sending audio)
- [x] 10.3 Implement hangup button (close connection, end session)
- [x] 10.4 Build compact floating call indicator (for when navigating away)
- [x] 10.5 Implement fallback mode indicator ("降級模式" badge)

## 11. Frontend — Audio Playback

- [x] 11.1 Implement WebRTC remote audio track playback (AudioElement or AudioContext)
- [x] 11.2 Implement volume control
- [x] 11.3 Handle audio playback edge cases (autoplay policy, audio context resume)

## 12. Shared Types

- [x] 12.1 Define VoiceCall, VoiceCallSession, VoiceCapability types in `packages/shared/src/types/`
- [x] 12.2 Define voice signaling WebSocket event types (offer, answer, ice, call_start, call_end, audio_chunk)
- [x] 12.3 Create Zod schemas for voice-related payloads
