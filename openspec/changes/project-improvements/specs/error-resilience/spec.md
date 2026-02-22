## ADDED Requirements

### Requirement: React Error Boundary wraps chat UI
The frontend SHALL have an Error Boundary component wrapping the main chat layout. When a component error occurs, a fallback UI with retry option SHALL be shown instead of a white screen.

#### Scenario: Component throws error
- **WHEN** a chat component throws an unhandled error during render
- **THEN** user sees a fallback UI with "Something went wrong" message and a "Retry" button

#### Scenario: Error recovery
- **WHEN** user clicks "Retry" on the error fallback
- **THEN** the errored component subtree re-mounts and attempts to render normally

### Requirement: WebSocket connection error feedback
The frontend SHALL display a visible connection status indicator when WebSocket connection fails or disconnects.

#### Scenario: Connection lost
- **WHEN** WebSocket connection drops
- **THEN** a banner or indicator appears showing "Reconnecting..." status

#### Scenario: Connection restored
- **WHEN** WebSocket reconnects successfully
- **THEN** the connection status indicator disappears

### Requirement: Form validation error display
Login and register forms SHALL display specific error messages for validation failures and server errors.

#### Scenario: Invalid credentials
- **WHEN** user submits login with wrong password
- **THEN** form displays "Invalid email or password" error message

#### Scenario: Registration validation
- **WHEN** user submits registration with password less than 8 characters
- **THEN** form displays password requirement error inline
