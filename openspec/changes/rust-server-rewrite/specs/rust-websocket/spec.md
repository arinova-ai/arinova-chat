## ADDED Requirements

### Requirement: Client WebSocket handler
The server SHALL accept WebSocket connections at `/ws` with identical message types and behavior as the Node.js handler.

#### Scenario: Client authentication
- **WHEN** a WebSocket connection is established at `/ws`
- **THEN** the server SHALL validate the session cookie and associate the connection with the user

#### Scenario: Heartbeat
- **WHEN** a client sends a `ping` message
- **THEN** the server SHALL respond with `pong`

#### Scenario: Idle timeout
- **WHEN** a client is idle for 45 seconds
- **THEN** the server SHALL close the connection

#### Scenario: Message rate limiting
- **WHEN** a client sends more than 10 messages per minute
- **THEN** the server SHALL reject excess messages

#### Scenario: Multi-connection support
- **WHEN** a user opens multiple tabs/devices
- **THEN** the server SHALL maintain multiple WebSocket connections and broadcast events to all

### Requirement: Agent WebSocket handler
The server SHALL accept agent WebSocket connections at `/ws/agent` with identical authentication and task protocol.

#### Scenario: Agent authentication
- **WHEN** an agent connects and sends `agent_auth` with a valid secret token
- **THEN** the server SHALL respond with `auth_ok` and register the agent connection

#### Scenario: Agent auth timeout
- **WHEN** an agent doesn't authenticate within 10 seconds
- **THEN** the server SHALL close the connection

#### Scenario: Single connection per agent
- **WHEN** an agent connects while already having an active connection
- **THEN** the server SHALL replace the old connection with the new one

#### Scenario: Skill declaration
- **WHEN** an agent sends `agent_auth` with a skills array
- **THEN** the server SHALL store the skills and make them queryable via REST API
