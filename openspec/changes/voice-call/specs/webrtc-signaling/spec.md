## ADDED Requirements

### Requirement: WebRTC signaling endpoint
The system SHALL provide a WebSocket-based signaling endpoint `/ws/voice` for WebRTC session negotiation (SDP offer/answer, ICE candidates).

#### Scenario: Client initiates call
- **WHEN** a user sends an SDP offer via the signaling endpoint
- **THEN** the server SHALL process the offer through mediasoup and return an SDP answer

#### Scenario: ICE candidate exchange
- **WHEN** a client sends ICE candidates via the signaling endpoint
- **THEN** the server SHALL relay them to the corresponding WebRTC transport

### Requirement: STUN/TURN configuration
The system SHALL provide STUN/TURN server configuration to clients for NAT traversal.

#### Scenario: Client requests ICE servers
- **WHEN** a client connects to the signaling endpoint
- **THEN** the server SHALL provide a list of STUN/TURN server URLs and credentials

### Requirement: Call session management
The system SHALL manage call sessions with states: `ringing`, `connected`, `on_hold`, `ended`.

#### Scenario: Call established
- **WHEN** both SDP offer and answer are exchanged and ICE connection succeeds
- **THEN** the call session state SHALL transition to `connected`

#### Scenario: Call ended by user
- **WHEN** the user hangs up
- **THEN** the server SHALL close the WebRTC transport, notify the agent, and transition to `ended`

#### Scenario: Call ended by agent
- **WHEN** the agent sends a call-end signal
- **THEN** the server SHALL close the WebRTC transport, notify the user, and transition to `ended`

### Requirement: Call authentication
The system SHALL require a valid user session to initiate a voice call. The call MUST be associated with an existing conversation.

#### Scenario: Authenticated user starts call
- **WHEN** an authenticated user initiates a call within a conversation
- **THEN** the system SHALL create a call session and begin signaling

#### Scenario: Unauthenticated call attempt
- **WHEN** an unauthenticated user attempts to connect to the signaling endpoint
- **THEN** the system SHALL reject with 401
