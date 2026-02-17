## 1. Dependencies & Infrastructure

- [ ] 1.1 Install `mediasoup` in server package
- [ ] 1.2 Configure mediasoup worker and router (audio-only, Opus codec)
- [ ] 1.3 Add STUN/TURN server configuration to environment variables
- [ ] 1.4 Add `voiceCapable` field to agents table and run migration

## 2. WebRTC Signaling

- [ ] 2.1 Create `/ws/voice` WebSocket endpoint with auth
- [ ] 2.2 Implement SDP offer/answer exchange via signaling
- [ ] 2.3 Implement ICE candidate relay
- [ ] 2.4 Implement call session state machine (ringing → connected → ended)
- [ ] 2.5 Implement ICE server list endpoint (`GET /api/voice/ice-servers`)

## 3. Server Media Relay

- [ ] 3.1 Create mediasoup WebRTC transport for user connection
- [ ] 3.2 Implement user audio consumer (receive audio from user's WebRTC track)
- [ ] 3.3 Implement audio frame extraction from mediasoup consumer → raw PCM/Opus
- [ ] 3.4 Implement audio frame injection into mediasoup producer → user playback
- [ ] 3.5 Implement concurrent call limit enforcement

## 4. Agent Voice Protocol

- [ ] 4.1 Extend agent WebSocket protocol with `voice_call_start` event (session ID, conversation context, audio format negotiation)
- [ ] 4.2 Implement `voice_audio_chunk` binary event — server → agent (user audio frames)
- [ ] 4.3 Implement `voice_audio_chunk` binary event — agent → server (agent audio frames)
- [ ] 4.4 Implement `voice_call_end` event
- [ ] 4.5 Implement audio format negotiation (PCM 16-bit 16kHz mono, Opus)

## 5. Agent Voice Capability Detection

- [ ] 5.1 Extend agent health check to query `/status` for `capabilities.voice` field
- [ ] 5.2 Store voice capability in agent health state (voiceCapable, tts, stt, realtimeVoice)
- [ ] 5.3 Add `voiceCapable` toggle to agent edit form (manual override)
- [ ] 5.4 Expose voice capability in agent API responses

## 6. Voice Fallback — Browser STT

- [ ] 6.1 Implement Web Speech API `SpeechRecognition` wrapper with start/stop/result events
- [ ] 6.2 Integrate browser STT into call flow — transcribe user speech → send as text message
- [ ] 6.3 Handle browser STT unsupported (show error, fall back to text input)

## 7. Voice Fallback — Browser TTS

- [ ] 7.1 Implement Web Speech API `SpeechSynthesis` wrapper with play/pause/cancel
- [ ] 7.2 Integrate browser TTS into call flow — read agent text replies aloud
- [ ] 7.3 Implement fallback mode detection (choose native vs browser STT/TTS per agent capability)

## 8. Call Transcript

- [ ] 8.1 Implement live transcript collection during call (aggregate STT text from agent or browser)
- [ ] 8.2 Display live transcript in chat area during active call
- [ ] 8.3 Save transcript as messages in conversation on call end (if enabled)
- [ ] 8.4 Add transcript toggle in call settings

## 9. Frontend — Call Button & Initiation

- [ ] 9.1 Add call button to conversation header (visible for voice capable agents)
- [ ] 9.2 Implement microphone permission request flow with guidance
- [ ] 9.3 Build calling state UI ("呼叫中..." with agent avatar and cancel button)
- [ ] 9.4 Implement WebRTC client (create peer connection, add audio track, handle signaling)

## 10. Frontend — Active Call UI

- [ ] 10.1 Build active call view (agent name/avatar, duration timer, controls)
- [ ] 10.2 Implement mute toggle (stop/resume sending audio)
- [ ] 10.3 Implement hangup button (close connection, end session)
- [ ] 10.4 Build compact floating call indicator (for when navigating away)
- [ ] 10.5 Implement fallback mode indicator ("降級模式" badge)

## 11. Frontend — Audio Playback

- [ ] 11.1 Implement WebRTC remote audio track playback (AudioElement or AudioContext)
- [ ] 11.2 Implement volume control
- [ ] 11.3 Handle audio playback edge cases (autoplay policy, audio context resume)

## 12. Shared Types

- [ ] 12.1 Define VoiceCall, VoiceCallSession, VoiceCapability types in `packages/shared/src/types/`
- [ ] 12.2 Define voice signaling WebSocket event types (offer, answer, ice, call_start, call_end, audio_chunk)
- [ ] 12.3 Create Zod schemas for voice-related payloads
