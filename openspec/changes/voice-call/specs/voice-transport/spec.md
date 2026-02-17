## ADDED Requirements

### Requirement: Browser audio capture
The system SHALL capture audio from the user's microphone using `getUserMedia()` and send it via WebRTC audio track.

#### Scenario: Microphone access granted
- **WHEN** the user grants microphone permission and starts a call
- **THEN** the system SHALL capture audio and transmit it through the WebRTC connection

#### Scenario: Microphone access denied
- **WHEN** the user denies microphone permission
- **THEN** the system SHALL display an error explaining that microphone access is required for voice calls

### Requirement: Server media relay via mediasoup
The system SHALL use mediasoup as an SFU to receive the user's audio track and produce audio for playback, relaying between user and agent.

#### Scenario: User audio relayed to agent
- **WHEN** the server receives audio from the user's WebRTC connection
- **THEN** the server SHALL extract the audio frames and forward them to the agent via WebSocket

#### Scenario: Agent audio relayed to user
- **WHEN** the server receives audio frames from the agent
- **THEN** the server SHALL inject them into a mediasoup producer and deliver to the user's WebRTC connection

### Requirement: Audio codec
The system SHALL use Opus codec for WebRTC audio transport for optimal quality-to-bandwidth ratio.

#### Scenario: Codec negotiation
- **WHEN** a WebRTC connection is established
- **THEN** the system SHALL negotiate Opus as the preferred audio codec

### Requirement: Concurrent call limit
The system SHALL enforce a maximum number of concurrent voice calls per server instance to prevent resource exhaustion.

#### Scenario: Call limit reached
- **WHEN** a user attempts to start a call and the server has reached its concurrent call limit
- **THEN** the system SHALL reject the call with an error indicating the server is busy
