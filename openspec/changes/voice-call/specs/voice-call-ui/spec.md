## ADDED Requirements

### Requirement: Call button in conversation
The system SHALL display a phone/call button in the conversation header for agents that are voice capable (native or fallback).

#### Scenario: Voice capable agent
- **WHEN** the user opens a conversation with a voice capable agent
- **THEN** the conversation header SHALL display a call button

#### Scenario: Agent offline
- **WHEN** the agent is offline (health check failed)
- **THEN** the call button SHALL be disabled with tooltip "Agent 離線"

### Requirement: Call initiation flow
The system SHALL show a calling state when the user initiates a call, with the option to cancel.

#### Scenario: User starts call
- **WHEN** the user clicks the call button
- **THEN** the UI SHALL show a "呼叫中..." state with agent avatar and a cancel button

#### Scenario: Call connects
- **WHEN** the WebRTC connection is established and audio is flowing
- **THEN** the UI SHALL transition to the active call view

### Requirement: Active call UI
The system SHALL display an active call interface with mute, speaker, and hangup controls, plus call duration timer.

#### Scenario: Active call display
- **WHEN** a call is in `connected` state
- **THEN** the UI SHALL show: agent name/avatar, call duration timer, mute button, speaker/volume button, hangup button

#### Scenario: Mute toggle
- **WHEN** the user clicks the mute button
- **THEN** the system SHALL stop sending audio to the agent and update the mute button state

#### Scenario: Hangup
- **WHEN** the user clicks the hangup button
- **THEN** the system SHALL end the call, close the WebRTC connection, and return to the chat view

### Requirement: Call overlay mode
The system SHALL display the active call as a compact overlay that allows the user to continue browsing conversations while on a call.

#### Scenario: Minimize call
- **WHEN** the user navigates away from the conversation during an active call
- **THEN** the UI SHALL show a compact floating call indicator with duration and hangup button

#### Scenario: Return to call
- **WHEN** the user clicks the floating call indicator
- **THEN** the UI SHALL navigate back to the conversation and show the full call view

### Requirement: Call transcript display
The system SHALL optionally display a live transcript in the chat area during a voice call (if STT text is available).

#### Scenario: Live transcript enabled
- **WHEN** a voice call is active and transcription is available
- **THEN** the chat area SHALL display a live transcript of the conversation with speaker labels

#### Scenario: Transcript saved after call
- **WHEN** a call ends and the user had transcript enabled
- **THEN** the transcript SHALL be saved as messages in the conversation history

### Requirement: Microphone permission guidance
The system SHALL guide the user to grant microphone permission if it has not been granted.

#### Scenario: Permission not yet requested
- **WHEN** the user clicks the call button and microphone permission has not been requested
- **THEN** the system SHALL show a brief explanation before triggering the browser permission dialog

#### Scenario: Permission previously denied
- **WHEN** the user clicks the call button but microphone permission was previously denied
- **THEN** the system SHALL show instructions on how to enable microphone in browser settings
