## ADDED Requirements

### Requirement: Browser-side STT fallback
The system SHALL use the Web Speech API (`SpeechRecognition`) to transcribe user speech to text when the agent does not have STT capability.

#### Scenario: Fallback STT active
- **WHEN** a user starts a voice call with an agent that has TTS but no STT
- **THEN** the system SHALL use browser STT to transcribe user speech and send as text messages to the agent

#### Scenario: Browser does not support Web Speech API
- **WHEN** the browser does not support `SpeechRecognition`
- **THEN** the system SHALL inform the user that voice input is not available and fall back to text input

### Requirement: Browser-side TTS fallback
The system SHALL use the Web Speech API (`SpeechSynthesis`) to read agent text replies aloud when the agent does not have TTS capability.

#### Scenario: Fallback TTS active
- **WHEN** a user starts a voice call with an agent that has no TTS
- **THEN** the system SHALL use browser TTS to read agent text replies aloud

#### Scenario: User selects TTS voice
- **WHEN** the user is using fallback TTS
- **THEN** the system SHALL use the system default voice (configurable in settings in Phase 2)

### Requirement: Fallback mode indication
The system SHALL clearly indicate when a voice call is in fallback mode (using browser STT/TTS instead of agent native voice).

#### Scenario: Fallback mode displayed
- **WHEN** a voice call is using browser STT or TTS fallback
- **THEN** the UI SHALL display a "降級模式" indicator with explanation

### Requirement: Mixed fallback support
The system SHALL support mixed scenarios where an agent has TTS but not STT, or STT but not TTS.

#### Scenario: Agent has TTS only
- **WHEN** an agent has TTS but no STT
- **THEN** the system SHALL use browser STT for user speech and agent native TTS for agent replies

#### Scenario: Agent has neither TTS nor STT
- **WHEN** an agent has no voice capabilities
- **THEN** the system SHALL use browser STT for user speech and browser TTS for agent replies (full fallback)
