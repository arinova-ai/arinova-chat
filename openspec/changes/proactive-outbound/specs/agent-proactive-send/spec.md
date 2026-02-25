## ADDED Requirements

### Requirement: Agent can send proactive messages via WebSocket
The agent SDK SHALL provide a `sendMessage(conversationId: string, content: string)` method that sends an `agent_send` event over the existing WebSocket connection.

#### Scenario: Agent sends a proactive message
- **WHEN** an authenticated agent calls `sendMessage("conv-123", "Hello from agent")`
- **THEN** the SDK sends `{"type": "agent_send", "conversationId": "conv-123", "content": "Hello from agent"}` over the WebSocket

#### Scenario: Agent is not connected
- **WHEN** an agent calls `sendMessage` while the WebSocket is not connected
- **THEN** the message is silently dropped (no error thrown)

### Requirement: Server handles agent_send event
The Rust server SHALL handle `agent_send` events from authenticated agents by creating a message in the database and delivering it to the conversation owner.

#### Scenario: Valid proactive send to direct conversation
- **WHEN** the server receives `agent_send` with a valid `conversationId` for a direct conversation where the agent is the assigned agent
- **THEN** the server creates a message with `role='agent'`, `status='completed'`, `sender_agent_id` set to the agent, and delivers it to the user via `stream_start` + `stream_end` (with content)

#### Scenario: Valid proactive send to group conversation
- **WHEN** the server receives `agent_send` with a valid `conversationId` for a group conversation where the agent is a member
- **THEN** the server creates the message and delivers it to the user the same way as direct conversations

#### Scenario: Agent is not a member of the conversation
- **WHEN** the server receives `agent_send` for a conversation the agent does not belong to
- **THEN** the server silently drops the message (no error sent back, no message created)

#### Scenario: Empty content
- **WHEN** the server receives `agent_send` with empty or whitespace-only content
- **THEN** the server silently drops the message

### Requirement: Frontend displays proactive messages
The frontend SHALL display proactive agent messages using the existing typing indicator → message flow (stream_start adds thinking indicator, stream_end with content creates completed message).

#### Scenario: Proactive message appears in chat
- **WHEN** the server delivers a proactive message via `stream_start` + `stream_end`
- **THEN** the frontend briefly shows the typing indicator, then displays the completed message with the agent's name

#### Scenario: Sidebar updates with proactive message
- **WHEN** a proactive message is delivered
- **THEN** the conversation sidebar shows the message as the last message preview

### Requirement: OpenClaw plugin sends proactive messages
The OpenClaw plugin's `sendMessageArinovaChat` function SHALL use the Agent SDK's `sendMessage` method to deliver messages instead of being a no-op.

#### Scenario: Plugin sends proactive message
- **WHEN** the OpenClaw plugin calls `sendMessageArinovaChat(conversationId, text)`
- **THEN** the SDK's `sendMessage` is called with the conversationId and text content

#### Scenario: Plugin has no active connection
- **WHEN** the plugin calls `sendMessageArinovaChat` but the agent is not connected
- **THEN** the function completes without error (fire-and-forget)
