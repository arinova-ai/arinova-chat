## ADDED Requirements

### Requirement: SDK initialization
The `@arinova/game-sdk` SHALL provide a simple initialization API for external game developers.

#### Scenario: Developer initializes SDK
- **WHEN** developer calls `Arinova.init({ appId: "..." })`
- **THEN** SDK stores the app configuration for subsequent API calls

### Requirement: OAuth login helper
The SDK SHALL provide a helper to initiate the OAuth login flow and retrieve user info.

#### Scenario: Login flow
- **WHEN** developer calls `Arinova.login({ scope: ["profile", "agents"] })`
- **THEN** SDK redirects to Arinova's OAuth authorize endpoint and handles the callback, returning `{ user, accessToken }`

### Requirement: Agent chat helper
The SDK SHALL provide helpers for calling the Agent API from the game's backend.

#### Scenario: Simple chat call
- **WHEN** developer calls `Arinova.agent.chat({ agentId, prompt, accessToken })`
- **THEN** SDK sends POST to `/api/v1/agent/chat` and returns the response

#### Scenario: Streaming chat call
- **WHEN** developer calls `Arinova.agent.chatStream({ agentId, prompt, accessToken, onChunk })`
- **THEN** SDK connects to `/api/v1/agent/chat/stream` via SSE and calls `onChunk` for each delta

### Requirement: TypeScript type definitions
The SDK SHALL export TypeScript types for all API request/response shapes.

#### Scenario: Type-safe API calls
- **WHEN** developer uses the SDK in a TypeScript project
- **THEN** all parameters and return values are fully typed with no `any` types
