## ADDED Requirements

### Requirement: Agent voice capability detection
The system SHALL detect whether an agent supports voice by checking the agent's `/status` endpoint for a `capabilities.voice` field.

#### Scenario: Agent reports voice capable
- **WHEN** an agent's status endpoint returns `capabilities: { voice: { tts: true, stt: true } }`
- **THEN** the system SHALL mark the agent as voice capable and display the call button

#### Scenario: Agent does not report voice capability
- **WHEN** an agent's status endpoint does not include voice capabilities
- **THEN** the system SHALL mark the agent as voice incapable and offer fallback mode only

#### Scenario: Agent profile manual override
- **WHEN** an agent's owner manually sets `voiceCapable: true` in agent settings
- **THEN** the system SHALL treat the agent as voice capable regardless of status endpoint

### Requirement: Agent voice WebSocket events
The system SHALL extend the agent WebSocket protocol (`/ws/agent`) with voice-related events for bidirectional audio streaming.

#### Scenario: Voice call started
- **WHEN** a user initiates a voice call with an agent
- **THEN** the server SHALL send a `voice_call_start` event to the agent with call session ID and conversation context

#### Scenario: Audio frames to agent
- **WHEN** the server receives audio frames from the user
- **THEN** the server SHALL send `voice_audio_chunk` events (binary) to the agent via WebSocket

#### Scenario: Audio frames from agent
- **WHEN** the agent sends `voice_audio_chunk` events back
- **THEN** the server SHALL relay the audio to the user's WebRTC connection

#### Scenario: Voice call ended
- **WHEN** a voice call ends (user hangup or agent hangup)
- **THEN** the server SHALL send a `voice_call_end` event to the agent

### Requirement: Agent voice audio format
The system SHALL define a standard audio format for agent communication: PCM 16-bit, 16kHz mono, or Opus-encoded frames. The format SHALL be negotiated in the `voice_call_start` event.

#### Scenario: Format negotiation
- **WHEN** a voice call starts
- **THEN** the `voice_call_start` event SHALL include supported audio formats, and the agent SHALL respond with its preferred format

### Requirement: Speech-to-speech passthrough
The system SHALL support agents that handle speech-to-speech directly (no separate STT→LLM→TTS pipeline), receiving raw audio and returning raw audio.

#### Scenario: Agent uses realtime voice model
- **WHEN** an agent reports `capabilities: { voice: { realtimeVoice: true } }`
- **THEN** the system SHALL stream raw audio bidirectionally without intermediate text conversion
