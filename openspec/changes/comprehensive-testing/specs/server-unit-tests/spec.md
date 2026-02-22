## ADDED Requirements

### Requirement: Sandbox executor tests
The system SHALL have unit tests for `sandbox/executor.ts` covering safe execution, blocked globals, timeout enforcement, console capture, and output truncation.

#### Scenario: Safe code execution
- **WHEN** executing `1 + 1`
- **THEN** the result is `2` with no errors

#### Scenario: Blocked globals
- **WHEN** executing code that accesses `require`, `process`, `fetch`, or `setTimeout`
- **THEN** each returns `undefined` and does not throw

#### Scenario: Timeout enforcement
- **WHEN** executing an infinite loop
- **THEN** execution is terminated and an error is returned within a reasonable time

#### Scenario: Console capture
- **WHEN** executing `console.log("hello")`
- **THEN** the output includes "hello"

### Requirement: App scanner tests
The system SHALL have unit tests for `utils/app-scanner.ts` covering safe content detection, dangerous pattern detection, and file scannability checks.

#### Scenario: Clean code passes scan
- **WHEN** scanning JavaScript code with no dangerous patterns
- **THEN** no issues are reported

#### Scenario: Dangerous patterns detected
- **WHEN** scanning code containing `eval()`, `document.cookie`, or `XMLHttpRequest`
- **THEN** appropriate security issues are reported for each pattern

### Requirement: Permission tier tests
The system SHALL have unit tests for `utils/permission-tier.ts` covering tier classification and manual review detection.

#### Scenario: No permissions classifies as basic
- **WHEN** classifying an empty permission array
- **THEN** the tier is the lowest/basic tier

#### Scenario: Dangerous permissions require review
- **WHEN** checking if a set including network or filesystem permissions requires manual review
- **THEN** the function returns true

### Requirement: Rate limiter tests
The system SHALL have unit tests for the in-memory rate limiter functions in `routes/sandbox.ts` and `ws/handler.ts`.

#### Scenario: Under limit allows requests
- **WHEN** sending fewer requests than the limit within the window
- **THEN** all requests are allowed

#### Scenario: Over limit blocks requests
- **WHEN** sending more requests than the limit within the window
- **THEN** requests beyond the limit are blocked

### Requirement: A2A client SSE parser tests
The system SHALL have unit tests for `a2a/client.ts` covering URL derivation, SSE line parsing, chunk delta extraction, and error handling.

#### Scenario: URL derivation from agent card
- **WHEN** deriving the task URL from `https://example.com/.well-known/agent.json`
- **THEN** the result is `https://example.com/tasks/send`

#### Scenario: Incremental delta extraction
- **WHEN** receiving chunks with accumulated text "Hello" then "Hello World"
- **THEN** the delta extracted from the second chunk is " World"

#### Scenario: Non-OK response handling
- **WHEN** the A2A endpoint returns a non-200 response
- **THEN** an error with "Agent unreachable" is thrown

### Requirement: Message sequence tests
The system SHALL have unit tests for `lib/message-seq.ts` covering sequence number generation.

#### Scenario: First message gets seq 1
- **WHEN** getting the next sequence for a conversation with no messages
- **THEN** the returned sequence is 1

#### Scenario: Sequential numbering
- **WHEN** getting the next sequence for a conversation with max seq 5
- **THEN** the returned sequence is 6
