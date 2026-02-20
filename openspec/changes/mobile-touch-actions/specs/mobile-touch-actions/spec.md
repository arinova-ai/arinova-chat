## ADDED Requirements

### Requirement: Long press message action sheet
On touch devices, the user SHALL be able to long press (~500ms) on a message bubble to open an action sheet with available message actions.

#### Scenario: Long press on a completed agent message
- **WHEN** user long presses on a completed agent message for 500ms
- **THEN** an action sheet slides up from the bottom with: Copy, React, Delete options

#### Scenario: Long press on an error message
- **WHEN** user long presses on an error message for 500ms
- **THEN** the action sheet includes: Copy, React, Delete, and Retry options

#### Scenario: Long press on a user message
- **WHEN** user long presses on a user's own message for 500ms
- **THEN** the action sheet includes: Copy, React, Delete options

#### Scenario: Long press cancelled by scroll
- **WHEN** user starts pressing a message but moves finger more than 10px
- **THEN** the long press SHALL be cancelled and no action sheet appears

#### Scenario: Long press cancelled by early release
- **WHEN** user presses a message but releases before 500ms
- **THEN** no action sheet appears

#### Scenario: Haptic feedback on trigger
- **WHEN** long press reaches 500ms threshold and action sheet opens
- **THEN** the device SHALL vibrate briefly (50ms) if `navigator.vibrate` is supported

### Requirement: Desktop hover behavior unchanged
The existing hover-based action buttons on message bubbles SHALL continue to work identically on desktop (pointer/hover devices).

#### Scenario: Hover on desktop
- **WHEN** user hovers over a message on a device with hover capability
- **THEN** the action buttons appear above the message bubble as before

### Requirement: Sidebar menu always visible on touch devices
On touch devices (detected via CSS `@media (hover: none)`), the three-dot menu button on sidebar conversation items SHALL always be visible.

#### Scenario: Touch device sidebar
- **WHEN** user views the sidebar on a touch device
- **THEN** the ⋮ button is visible on every conversation item without needing hover

#### Scenario: Desktop sidebar unchanged
- **WHEN** user views the sidebar on a desktop device with hover
- **THEN** the ⋮ button only appears on hover, as before

### Requirement: Action sheet dismissal
The action sheet SHALL be dismissible by tapping outside, swiping down, or tapping Cancel.

#### Scenario: Tap outside to dismiss
- **WHEN** user taps outside the action sheet overlay
- **THEN** the action sheet closes without performing any action

#### Scenario: Action execution
- **WHEN** user taps an action in the action sheet (e.g., Copy)
- **THEN** the action is performed and the action sheet closes
